// The Windows download: a WebView2 window on the live site. Nothing of the game ships in it: the server's COOP/COEP
// headers make the page cross-origin isolated as in Edge, the same-origin /net, /api and lazyfs paths keep working, and
// a game deploy reaches desktop players the way it reaches the browser (loader.js reloads on a new /__version).
// Only this shell is versioned: it opens on its own splash page (splash/index.html), checks the GitHub release's
// latest.json and, when newer, installs it (the NSIS installer in passive mode, then it relaunches) before the game
// loads, so no session is cut short. Then the splash checks the server is reachable and goes to the game, or offers Retry.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::webview::{Color, PageLoadEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_window_state::StateFlags;

// F11 does what Alt+Enter does in stage.js (the stage element goes full screen); runs on every page, the splash too
const KEYS: &str = r#"addEventListener("keydown", (e) => {
  if (e.key !== "F11") return;
  e.preventDefault(); e.stopImmediatePropagation();
  dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", altKey: true }));
}, true);"#;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // size, position and maximized across launches; not full screen, which belongs to the page (see fullscreen)
        .plugin(tauri_plugin_window_state::Builder::new()
            .with_state_flags(StateFlags::SIZE | StateFlags::POSITION | StateFlags::MAXIMIZED)
            .build())
        .setup(|app| {
            let started = AtomicBool::new(false);
            let win = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Duel Evolution")
                .inner_size(1024.0, 768.0)
                .min_inner_size(640.0, 480.0)
                .center()
                .background_color(Color(0, 0, 0, 255))
                .initialization_script(KEYS)
                // the splash and the game's own pages stay in the window; any other link opens in the browser
                .on_navigation(|url| {
                    let ours = url.scheme() == "tauri" || url.host_str().is_some_and(|h| {
                        h == "tauri.localhost" || h == "ygoevolution.com" || h.ends_with(".ygoevolution.com")
                    });
                    if !ours && matches!(url.scheme(), "http" | "https") {
                        let _ = tauri_plugin_opener::open_url(url.as_str(), None::<&str>);
                    }
                    ours
                })
                // the update check starts once the splash can show it
                .on_page_load(move |win, load| {
                    if load.event() == PageLoadEvent::Finished && !started.swap(true, Ordering::SeqCst) {
                        tauri::async_runtime::spawn(async move {
                            if let Err(e) = update(win.app_handle(), &win).await {
                                eprintln!("update: {e}");   // offline, GitHub down, a bad signature: play this version
                            }
                            let _ = win.eval("go()");
                        });
                    }
                })
                .build()?;
            #[cfg(windows)]
            fullscreen(&win);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Duel Evolution");
}

async fn update(app: &AppHandle, win: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    // only the check is bounded: a slow line still finishes the download instead of retrying it every launch
    let updater = app.updater()?;
    let Some(update) = tokio::time::timeout(Duration::from_secs(5), updater.check()).await?? else { return Ok(()) };
    let _ = win.eval(format!("status({:?})", format!("Updating to {}…", update.version)));
    let (mut got, mut shown) = (0u64, 0u64);
    update.download_and_install(|chunk, total| {
        got += chunk as u64;
        let pct = total.map_or(0, |t| got * 100 / t.max(1));
        if pct != shown {
            shown = pct;
            let _ = win.eval(format!("status({:?})", format!("Updating to {}… {pct}%", update.version)));
        }
    }, || {}).await?;   // on Windows this starts the installer and exits
    app.restart();
}

// WebView2 keeps an element's full screen inside the webview: the page's own full screen (stage.js's button,
// Alt+Enter, F11) makes the window full screen too, and Esc out of it restores the window.
#[cfg(windows)]
fn fullscreen(win: &WebviewWindow) {
    use webview2_com::ContainsFullScreenElementChangedEventHandler;
    let w = win.clone();
    let _ = win.with_webview(move |view| unsafe {
        let Ok(core) = view.controller().CoreWebView2() else { return };
        let handler = ContainsFullScreenElementChangedEventHandler::create(Box::new(move |sender, _| {
            if let Some(core) = sender {
                let mut on = windows_core::BOOL::default();
                core.ContainsFullScreenElement(&mut on)?;
                let _ = w.set_fullscreen(on.as_bool());
            }
            Ok(())
        }));
        let mut token = 0;
        let _ = core.add_ContainsFullScreenElementChanged(&handler, &mut token);
    });
}
