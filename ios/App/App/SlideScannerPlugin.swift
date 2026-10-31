import Capacitor
import CoreImage
import UIKit
import Vision

/// On-device processing for slide photos, with Apple's Vision framework:
/// finds the slide (or any document-like rectangle) in a photo taken from an
/// angle and flattens it square-on, then reads the text on it. Nothing
/// leaves the phone.
@objc(SlideScannerPlugin)
public class SlideScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SlideScannerPlugin"
    public let jsName = "SlideScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "process", returnType: CAPPluginReturnPromise),
    ]

    private let context = CIContext()

    /// {data}: base64 JPEG. Resolves with {text, straightened, data?} --
    /// `data` (base64 JPEG of the flattened slide) only when one was found.
    @objc func process(_ call: CAPPluginCall) {
        guard
            let base64 = call.getString("data"),
            let bytes = Data(base64Encoded: base64),
            let image = CIImage(data: bytes, options: [.applyOrientationProperty: true])
        else {
            call.reject("Couldn't read the photo")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            var result: [String: Any] = ["straightened": false]
            var page = image
            if let quad = self.findSlide(in: image), let flat = self.flatten(image, to: quad),
               let jpeg = self.context.jpegRepresentation(
                   of: flat,
                   colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                   options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.85]
               ) {
                page = flat
                result["straightened"] = true
                result["data"] = jpeg.base64EncodedString()
            }
            result["text"] = self.readText(in: page)
            call.resolve(result)
        }
    }

    // MARK: - Finding the slide

    /// The slide's corners (Vision's normalized, bottom-left-origin space),
    /// or nil when there's no confident, reasonably sized rectangle -- a
    /// photo of people or a room is left as it is.
    private func findSlide(in image: CIImage) -> VNRectangleObservation? {
        let handler = VNImageRequestHandler(ciImage: image, options: [:])

        // Projected slides and screens read as rectangles; document
        // segmentation catches paper handouts and screens rectangle
        // detection misses. Try the stricter one first.
        let rectangles = VNDetectRectanglesRequest()
        rectangles.maximumObservations = 1
        rectangles.minimumConfidence = 0.8
        rectangles.minimumSize = 0.3
        rectangles.minimumAspectRatio = 0.3
        rectangles.quadratureTolerance = 30
        let document = VNDetectDocumentSegmentationRequest()
        try? handler.perform([rectangles, document])

        let candidates = (rectangles.results ?? []) + (document.results ?? []).filter { $0.confidence >= 0.8 }
        return candidates.first { quad in
            let area = Self.area(of: quad)
            // Too small to be the subject, or already the whole frame.
            return area >= 0.15 && area <= 0.95
        }
    }

    private static func area(of quad: VNRectangleObservation) -> CGFloat {
        let p = [quad.topLeft, quad.topRight, quad.bottomRight, quad.bottomLeft]
        var sum: CGFloat = 0
        for i in 0..<4 {
            let a = p[i], b = p[(i + 1) % 4]
            sum += a.x * b.y - b.x * a.y
        }
        return abs(sum) / 2
    }

    private func flatten(_ image: CIImage, to quad: VNRectangleObservation) -> CIImage? {
        let size = image.extent.size
        func point(_ p: CGPoint) -> CIVector {
            CIVector(x: image.extent.minX + p.x * size.width, y: image.extent.minY + p.y * size.height)
        }
        guard let filter = CIFilter(name: "CIPerspectiveCorrection") else { return nil }
        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(point(quad.topLeft), forKey: "inputTopLeft")
        filter.setValue(point(quad.topRight), forKey: "inputTopRight")
        filter.setValue(point(quad.bottomRight), forKey: "inputBottomRight")
        filter.setValue(point(quad.bottomLeft), forKey: "inputBottomLeft")
        return filter.outputImage
    }

    // MARK: - Reading the text

    /// The text on the slide, top to bottom, one line per recognized line.
    private func readText(in image: CIImage) -> String {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        if #available(iOS 16.0, *) { request.automaticallyDetectsLanguage = true }
        try? VNImageRequestHandler(ciImage: image, options: [:]).perform([request])

        let lines = (request.results ?? [])
            .filter { $0.confidence >= 0.3 }
            .sorted { a, b in
                // Same line if their vertical centers are close; then left to right.
                if abs(a.boundingBox.midY - b.boundingBox.midY) > 0.01 { return a.boundingBox.midY > b.boundingBox.midY }
                return a.boundingBox.minX < b.boundingBox.minX
            }
            .compactMap { $0.topCandidates(1).first?.string }
        return lines.joined(separator: "\n")
    }
}
