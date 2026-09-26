package expo.modules.eventmode

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/** Foreground service of type connectedDevice with a persistent notification. It does no work itself:
 *  its only job is to keep the app process (and the JS Bluetooth engine) alive while Event Mode is on. */
class EventModeService : Service() {
  companion object {
    const val CHANNEL_ID = "event_mode"
    const val NOTIFICATION_ID = 4242
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    @Volatile var running = false
    @Volatile var lastError: String? = null
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Event Mode is on"
    val body = intent?.getStringExtra(EXTRA_BODY) ?: "Finding your matches nearby over Bluetooth."
    try {
      val notification = buildNotification(title, body)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      running = true
      lastError = null
    } catch (e: Exception) {
      // Android 14+ throws if the Bluetooth runtime permissions weren't granted first, and Android 12+
      // refuses to start a foreground service from the background. Fail quietly; the app keeps working.
      Log.w("EventMode", "could not start foreground service", e)
      lastError = e.javaClass.simpleName + ": " + (e.message ?: "")
      running = false
      stopSelf()
    }
    return START_NOT_STICKY // if the system kills us, don't restart without the user
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  private fun buildNotification(title: String, body: String): Notification {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
      val channel = NotificationChannel(CHANNEL_ID, "Event Mode", NotificationManager.IMPORTANCE_LOW)
      channel.description = "Shown while Event Mode scans for people nearby"
      manager.createNotificationChannel(channel)
    }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val tap = launch?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    @Suppress("DEPRECATION")
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, CHANNEL_ID)
                  else Notification.Builder(this)
    return builder
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
      .setOngoing(true)
      .setContentIntent(tap)
      .build()
  }
}
