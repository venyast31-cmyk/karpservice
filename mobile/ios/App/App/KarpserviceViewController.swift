import UIKit
import Capacitor

final class KarpserviceViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(KarpserviceAPIPlugin())
        view.backgroundColor = UIColor(red: 13/255, green: 16/255, blue: 20/255, alpha: 1)
        webView?.isOpaque = false
        webView?.backgroundColor = view.backgroundColor
        webView?.scrollView.backgroundColor = view.backgroundColor
    }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
