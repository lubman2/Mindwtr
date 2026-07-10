import WidgetKit
import SwiftUI

@main
struct MindwtrWidgetsBundle: WidgetBundle {
    var body: some Widget {
        MindwtrTasksWidget()
        // Offers no families before iOS 16, so it stays invisible on iOS 15.
        MindwtrFocusLockWidget()
    }
}
