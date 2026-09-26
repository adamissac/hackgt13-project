package expo.modules.eventmode

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class EventModeModule : Module() {
  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("EventMode")

    // Starts (or updates the text of) the foreground service. Call only while the app is in the foreground.
    AsyncFunction("start") { title: String, body: String ->
      val intent = Intent(context, EventModeService::class.java)
        .putExtra(EventModeService.EXTRA_TITLE, title)
        .putExtra(EventModeService.EXTRA_BODY, body)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent)
      else context.startService(intent)
    }

    AsyncFunction("stop") {
      context.stopService(Intent(context, EventModeService::class.java))
    }

    Function("isRunning") { EventModeService.running }

    Function("lastError") { EventModeService.lastError }
  }
}
