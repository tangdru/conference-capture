import Capacitor
import UIKit

/// Bridge to PhotoUploadQueue: hands photos to iOS to upload in the
/// background, so they keep going after the app is left, locked or closed.
@objc(PhotoUploadsPlugin)
public class PhotoUploadsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoUploadsPlugin"
    public let jsName = "PhotoUploads"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enqueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
    ]

    override public func load() {
        PhotoUploadQueue.shared.onUploaded = { [weak self] id in
            self?.notifyListeners("uploaded", data: ["id": id])
        }
    }

    /// {token, apikey, storageUrl, restUrl}: the signed-in user's current
    /// access token and the project's endpoints. Also restarts anything
    /// waiting on a fresh token.
    @objc func setAuth(_ call: CAPPluginCall) {
        guard
            let token = call.getString("token"), let apikey = call.getString("apikey"),
            let storageUrl = call.getString("storageUrl"), let restUrl = call.getString("restUrl")
        else {
            call.reject("Missing auth")
            return
        }
        PhotoUploadQueue.shared.setAuth(.init(token: token, apikey: apikey, storageUrl: storageUrl, restUrl: restUrl))
        call.resolve()
    }

    /// {id, sessionId, data | filePath, originalPath, flattenedPath, row}:
    /// saves the photo to disk at once, straightens and reads it, then queues
    /// the uploads and the timeline row. The photo comes as base64 `data`, or
    /// as `filePath` (a file:// URL) from the native camera, which skips
    /// sending it through the page as text. Resolves with {text, data?} once
    /// it's safely queued -- `data` is the flattened slide, if one was found.
    @objc func enqueue(_ call: CAPPluginCall) {
        let fromFile = call.getString("filePath").flatMap(URL.init(string:)).flatMap { try? Data(contentsOf: $0) }
        let fromData = call.getString("data").flatMap { Data(base64Encoded: $0) }
        guard
            let id = call.getString("id"), let sessionId = call.getString("sessionId"),
            let bytes = fromFile ?? fromData,
            let originalPath = call.getString("originalPath"), let flattenedPath = call.getString("flattenedPath"),
            let row = call.getObject("row")
        else {
            call.reject("Missing photo")
            return
        }
        PhotoUploadQueue.shared.enqueue(
            id: id, sessionId: sessionId, jpeg: bytes,
            originalPath: originalPath, flattenedPath: flattenedPath, row: row
        ) { result in
            switch result {
            case let .success(scan):
                var out: [String: Any] = ["text": scan.text]
                if let flattened = scan.flattened { out["data"] = flattened.base64EncodedString() }
                call.resolve(out)
            case let .failure(error):
                call.reject(error.localizedDescription)
            }
        }
    }

    /// Resolves with {items: [{id, sessionId, row, data}]} -- every photo not
    /// yet fully uploaded, with the image to show for it.
    @objc func pending(_ call: CAPPluginCall) {
        PhotoUploadQueue.shared.pending { items in
            call.resolve(["items": items])
        }
    }

    /// {id?, sessionId?}: drops a deleted photo (or a deleted session's) from
    /// the queue so it isn't uploaded after all.
    @objc func cancel(_ call: CAPPluginCall) {
        PhotoUploadQueue.shared.cancel(id: call.getString("id"), sessionId: call.getString("sessionId"))
        call.resolve()
    }
}

/// Photos waiting to upload, kept on disk until they're in Supabase. Each is
/// a folder holding the image(s), the timeline row to insert, and a manifest.
/// The uploads run in a background URLSession, which iOS carries on with
/// when the app is suspended or closed, and holds until there's a
/// connection; the row goes last, once its images are stored, so the
/// timeline never points at a photo that isn't there yet.
final class PhotoUploadQueue: NSObject, URLSessionTaskDelegate {
    static let shared = PhotoUploadQueue()
    static let sessionIdentifier = "photo-uploads"

    struct Auth: Codable {
        let token: String
        let apikey: String
        let storageUrl: String
        let restUrl: String
    }

    private struct Upload: Codable {
        /// File in the item's folder, and where it goes: a storage object
        /// path in cc-photos, or nil for the row (row.json).
        let file: String
        let objectPath: String?
        var done = false
        var attempts = 0
    }

    private struct Manifest: Codable {
        let id: String
        let sessionId: String
        /// The image to show while it's pending.
        let displayFile: String
        var uploads: [Upload]
        /// Last attempt was refused (most likely an expired token); waits
        /// for setAuth.
        var waitingForAuth = false
    }

    var onUploaded: ((String) -> Void)?
    /// From AppDelegate, when iOS relaunches the app to report on uploads.
    var backgroundCompletion: (() -> Void)?

    private let queue = DispatchQueue(label: "photo-uploads")
    private let root: URL
    private var auth: Auth?
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false
        let ops = OperationQueue()
        ops.underlyingQueue = queue
        ops.maxConcurrentOperationCount = 1
        return URLSession(configuration: config, delegate: self, delegateQueue: ops)
    }()

    private static let authKey = "PhotoUploadQueue.auth"
    private static let maxAttempts = 5

    private override init() {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        root = support.appendingPathComponent("PhotoUploads", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        // Not backed up: these are transient copies of what's going to Supabase.
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var dir = root
        try? dir.setResourceValues(values)
        if let data = UserDefaults.standard.data(forKey: Self.authKey) {
            auth = try? JSONDecoder().decode(Auth.self, from: data)
        }
        super.init()
    }

    /// Reconnects to uploads still running from a previous launch.
    func attach() {
        queue.async { _ = self.session }
    }

    func setAuth(_ auth: Auth) {
        queue.async {
            self.auth = auth
            if let data = try? JSONEncoder().encode(auth) {
                UserDefaults.standard.set(data, forKey: Self.authKey)
            }
            self.resumeAll(resetAttempts: true)
        }
    }

    func enqueue(
        id: String, sessionId: String, jpeg: Data,
        originalPath: String, flattenedPath: String, row: JSObject,
        completion: @escaping (Result<(text: String, flattened: Data?), Error>) -> Void
    ) {
        // Finishing the scan and queueing doesn't depend on the app staying
        // in front.
        var task = UIBackgroundTaskIdentifier.invalid
        task = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(task) }
        let finish: (Result<(text: String, flattened: Data?), Error>) -> Void = { result in
            completion(result)
            UIApplication.shared.endBackgroundTask(task)
        }

        let dir = root.appendingPathComponent(id, isDirectory: true)
        do {
            // The original goes to disk before anything else can go wrong.
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            try jpeg.write(to: dir.appendingPathComponent("original.jpg"), options: .atomic)
        } catch {
            finish(.failure(error))
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            let scan = SlideScan.process(jpeg) ?? (text: "", flattened: nil)
            var row = row
            row["text"] = scan.text
            row["photo_path"] = originalPath
            var uploads = [Upload(file: "original.jpg", objectPath: originalPath)]
            if let flattened = scan.flattened,
               (try? flattened.write(to: dir.appendingPathComponent("flattened.jpg"), options: .atomic)) != nil {
                // The straightened slide is what's shown and goes in the deck;
                // the original is kept alongside it.
                row["photo_path"] = flattenedPath
                row["payload"] = ["originalPhotoPath": originalPath] as JSObject
                uploads.append(Upload(file: "flattened.jpg", objectPath: flattenedPath))
            }
            do {
                let rowData = try JSONSerialization.data(withJSONObject: Self.plain(row))
                try rowData.write(to: dir.appendingPathComponent("row.json"), options: .atomic)
                uploads.append(Upload(file: "row.json", objectPath: nil))
                let manifest = Manifest(
                    id: id, sessionId: sessionId,
                    displayFile: uploads.count == 3 ? "flattened.jpg" : "original.jpg",
                    uploads: uploads
                )
                self.queue.async {
                    self.save(manifest)
                    self.start(manifest)
                    finish(.success(scan))
                }
            } catch {
                finish(.failure(error))
            }
        }
    }

    func pending(_ completion: @escaping ([[String: Any]]) -> Void) {
        queue.async {
            let items: [[String: Any]] = self.manifests().compactMap { manifest in
                let dir = self.root.appendingPathComponent(manifest.id, isDirectory: true)
                guard
                    let image = try? Data(contentsOf: dir.appendingPathComponent(manifest.displayFile)),
                    let rowData = try? Data(contentsOf: dir.appendingPathComponent("row.json")),
                    let row = try? JSONSerialization.jsonObject(with: rowData)
                else { return nil }
                return ["id": manifest.id, "sessionId": manifest.sessionId, "row": row, "data": image.base64EncodedString()]
            }
            completion(items)
        }
    }

    func cancel(id: String?, sessionId: String?) {
        queue.async {
            let doomed = self.manifests().filter { $0.id == id || (sessionId != nil && $0.sessionId == sessionId) }
            guard !doomed.isEmpty else { return }
            let ids = Set(doomed.map(\.id))
            self.session.getAllTasks { tasks in
                tasks.filter { ids.contains(Self.parse($0.taskDescription)?.id ?? "") }.forEach { $0.cancel() }
            }
            doomed.forEach { self.remove($0.id) }
        }
    }

    // MARK: - Running uploads (on `queue`)

    /// Starts whatever's next for an item: its images, then (once they're
    /// all stored) its row.
    private func start(_ manifest: Manifest, skipping running: Set<String> = []) {
        guard let auth, !manifest.waitingForAuth else { return }
        let dir = root.appendingPathComponent(manifest.id, isDirectory: true)
        let imagesDone = manifest.uploads.allSatisfy { $0.objectPath == nil || $0.done }
        for (index, upload) in manifest.uploads.enumerated() where !upload.done {
            if upload.objectPath == nil && !imagesDone { continue }
            let description = "\(manifest.id)|\(index)"
            if running.contains(description) { continue }

            var request: URLRequest
            if let objectPath = upload.objectPath {
                request = URLRequest(url: URL(string: "\(auth.storageUrl)/object/cc-photos/\(objectPath)")!)
                request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
                // A retry after a dropped response must not fail as a duplicate.
                request.setValue("true", forHTTPHeaderField: "x-upsert")
            } else {
                request = URLRequest(url: URL(string: "\(auth.restUrl)/cc_timeline_items?on_conflict=id")!)
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue("resolution=merge-duplicates,return=minimal", forHTTPHeaderField: "Prefer")
            }
            request.httpMethod = "POST"
            request.setValue("Bearer \(auth.token)", forHTTPHeaderField: "Authorization")
            request.setValue(auth.apikey, forHTTPHeaderField: "apikey")

            let task = session.uploadTask(with: request, fromFile: dir.appendingPathComponent(upload.file))
            task.taskDescription = description
            task.resume()
        }
    }

    private func resumeAll(resetAttempts: Bool) {
        session.getAllTasks { tasks in
            self.queue.async {
                let running = Set(tasks.compactMap(\.taskDescription))
                for var manifest in self.manifests() {
                    if resetAttempts {
                        manifest.waitingForAuth = false
                        for i in manifest.uploads.indices { manifest.uploads[i].attempts = 0 }
                        self.save(manifest)
                    }
                    self.start(manifest, skipping: running)
                }
            }
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let (id, index) = Self.parse(task.taskDescription), var manifest = load(id),
              manifest.uploads.indices.contains(index) else { return }
        let status = (task.response as? HTTPURLResponse)?.statusCode ?? 0

        if error == nil && (200..<300).contains(status) {
            manifest.uploads[index].done = true
            if manifest.uploads.allSatisfy(\.done) {
                remove(id)
                let callback = onUploaded
                DispatchQueue.main.async { callback?(id) }
                return
            }
            save(manifest)
            start(manifest)
            return
        }

        if (error as? URLError)?.code == .cancelled { return }
        manifest.uploads[index].attempts += 1
        // Refused (an expired token, mostly) or failing over and over: wait
        // for the app to come back with a fresh token rather than spin.
        if (400..<500).contains(status) || manifest.uploads[index].attempts >= Self.maxAttempts {
            manifest.waitingForAuth = true
        }
        save(manifest)
        start(manifest)
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.backgroundCompletion?()
            self.backgroundCompletion = nil
        }
    }

    // MARK: - Storage (on `queue`)

    private func manifests() -> [Manifest] {
        let dirs = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        return dirs.compactMap { load($0.lastPathComponent) }
    }

    private func load(_ id: String) -> Manifest? {
        let url = root.appendingPathComponent(id, isDirectory: true).appendingPathComponent("manifest.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Manifest.self, from: data)
    }

    private func save(_ manifest: Manifest) {
        let url = root.appendingPathComponent(manifest.id, isDirectory: true).appendingPathComponent("manifest.json")
        if let data = try? JSONEncoder().encode(manifest) { try? data.write(to: url, options: .atomic) }
    }

    private func remove(_ id: String) {
        try? FileManager.default.removeItem(at: root.appendingPathComponent(id, isDirectory: true))
    }

    private static func parse(_ description: String?) -> (id: String, index: Int)? {
        let parts = description?.split(separator: "|") ?? []
        guard parts.count == 2, let index = Int(parts[1]) else { return nil }
        return (String(parts[0]), index)
    }

    /// A Capacitor JSObject as plain Foundation values JSONSerialization takes.
    private static func plain(_ object: JSObject) -> [String: Any] {
        object.mapValues { value -> Any in
            if let nested = value as? JSObject { return plain(nested) }
            if value is NSNull { return NSNull() }
            return value
        }
    }
}
