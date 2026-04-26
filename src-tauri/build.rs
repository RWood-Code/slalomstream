fn main() {
    match tauri_build::try_build(tauri_build::Attributes::default()) {
        Ok(_) => {}
        Err(err) => {
            let msg = format!("{:#}", err);
            eprintln!("=== TAURI BUILD ERROR ===\n{}\n========================", msg);
            let _ = std::fs::write("/tmp/tauri-build-error.txt", &msg);
            std::process::exit(1);
        }
    }
}
