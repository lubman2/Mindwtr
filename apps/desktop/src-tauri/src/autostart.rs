#[cfg(target_os = "linux")]
use crate::install::is_flatpak;
#[cfg(target_os = "windows")]
use crate::install::is_windows_store_install;
use tauri_plugin_autostart::ManagerExt;

/// Task id declared as <uap5:StartupTask> in the Microsoft Store AppxManifest
/// (generated in .github/workflows/release-windows.yml). Keep both in sync.
#[cfg(target_os = "windows")]
const STORE_STARTUP_TASK_ID: &str = "MindwtrStartup";

fn autostart_error(error: tauri_plugin_autostart::Error) -> String {
    error.to_string()
}

#[tauri::command]
pub(crate) async fn get_launch_at_startup_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    // MSIX virtualizes HKCU writes, so the registry Run key the autostart
    // plugin manages never reaches the real hive in Store installs — Windows
    // ignores it while is_enabled() happily reads it back as on. Store builds
    // must go through the declared StartupTask instead.
    #[cfg(target_os = "windows")]
    if is_windows_store_install() {
        return get_store_launch_at_startup_enabled().await;
    }

    app.autolaunch().is_enabled().map_err(autostart_error)
}

#[tauri::command]
pub(crate) async fn set_launch_at_startup_enabled(
    app: tauri::AppHandle,
    enabled: bool,
) -> Result<bool, String> {
    #[cfg(target_os = "linux")]
    if is_flatpak() {
        return set_flatpak_launch_at_startup_enabled(enabled).await;
    }

    #[cfg(target_os = "windows")]
    if is_windows_store_install() {
        return set_store_launch_at_startup_enabled(enabled).await;
    }

    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(autostart_error)?;
    } else {
        autostart.disable().map_err(autostart_error)?;
    }
    autostart.is_enabled().map_err(autostart_error)
}

#[cfg(target_os = "linux")]
async fn set_flatpak_launch_at_startup_enabled(enabled: bool) -> Result<bool, String> {
    use ashpd::desktop::background::Background;

    let response = Background::request()
        .reason("Keep reminders and sync running when Mindwtr is in the background")
        .auto_start(enabled)
        .dbus_activatable(false)
        .send()
        .await
        .map_err(|error| error.to_string())?
        .response()
        .map_err(|error| error.to_string())?;

    Ok(response.auto_start())
}

#[cfg(target_os = "windows")]
fn store_startup_task() -> Result<windows::ApplicationModel::StartupTask, String> {
    use windows::core::HSTRING;

    windows::ApplicationModel::StartupTask::GetAsync(&HSTRING::from(STORE_STARTUP_TASK_ID))
        .map_err(|error| error.to_string())?
        .get()
        .map_err(|error| error.to_string())
}

#[cfg(target_os = "windows")]
fn store_startup_state_is_enabled(state: windows::ApplicationModel::StartupTaskState) -> bool {
    use windows::ApplicationModel::StartupTaskState;

    state == StartupTaskState::Enabled || state == StartupTaskState::EnabledByPolicy
}

#[cfg(target_os = "windows")]
async fn get_store_launch_at_startup_enabled() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let task = store_startup_task()?;
        let state = task.State().map_err(|error| error.to_string())?;
        Ok(store_startup_state_is_enabled(state))
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(target_os = "windows")]
async fn set_store_launch_at_startup_enabled(enabled: bool) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use windows::ApplicationModel::StartupTaskState;

        let task = store_startup_task()?;
        if !enabled {
            task.Disable().map_err(|error| error.to_string())?;
            return Ok(false);
        }
        let state = task
            .RequestEnableAsync()
            .map_err(|error| error.to_string())?
            .get()
            .map_err(|error| error.to_string())?;
        // Windows will not let an app re-enable a task the user disabled in
        // Task Manager / Settings; surface where to flip it back instead of
        // pretending the toggle worked.
        if state == StartupTaskState::DisabledByUser {
            return Err(
                "Startup for Mindwtr is turned off in Windows. Enable it under Settings > Apps > Startup, then try again.".to_string(),
            );
        }
        if state == StartupTaskState::DisabledByPolicy {
            return Err("Startup is disabled by system policy on this device.".to_string());
        }
        Ok(store_startup_state_is_enabled(state))
    })
    .await
    .map_err(|error| error.to_string())?
}
