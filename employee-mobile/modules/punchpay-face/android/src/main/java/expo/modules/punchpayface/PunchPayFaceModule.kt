package expo.modules.punchpayface

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PunchPayFaceModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PunchPayFace")

    OnDestroy {
      FaceEngine.close()
    }

    AsyncFunction("setGallery") { json: String ->
      FaceEngine.setGalleryJson(json)
    }

    AsyncFunction("getPerformanceStats") {
      FaceEngine.performanceStats()
    }

    View(FaceCameraView::class) {
      Events("onRecognition")

      Prop("active") { view: FaceCameraView, active: Boolean ->
        view.active = active
      }

      Prop("mode") { view: FaceCameraView, mode: String ->
        view.mode = mode
      }

      Prop("paused") { view: FaceCameraView, paused: Boolean ->
        view.paused = paused
      }

      Prop("enrollStep") { view: FaceCameraView, step: String ->
        view.enrollStep = step
      }
    }
  }
}
