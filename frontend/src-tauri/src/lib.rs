use tauri_plugin_sql::{Builder, Migration, MigrationKind};
use tauri::Manager;
use std::fs;
use std::path::PathBuf;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[tauri::command]
fn save_product_image(
    app: tauri::AppHandle,
    product_id: i64,
    data: Vec<u8>
) -> Result<(), String> {

    use image::ImageReader;
    use std::io::Cursor;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let images_dir = app_dir.join("images");

    if !images_dir.exists() {
        fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    }

    let file_path = images_dir.join(format!("{}.jpg", product_id));

    // En save_product_image (fallback con bytes)
    let img = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| e.to_string())?;

    let resized = img.thumbnail(600, 600); // ← thumbnail + Triangle implícito

    resized
        .save_with_format(file_path, image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Guarda imagen leyendo directamente desde ruta — sin pasar bytes por IPC.
#[tauri::command]
fn save_product_image_from_path(
    app: tauri::AppHandle,
    product_id: i64,
    src_path: String,
) -> Result<(), String> {

    use image::ImageReader;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let images_dir = app_dir.join("images");

    if !images_dir.exists() {
        fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    }

    let dest_path = images_dir.join(format!("{}.jpg", product_id));

    // En save_product_image_from_path
    let img = ImageReader::open(&src_path)
        .map_err(|e| format!("No se pudo abrir la imagen: {}", e))?
        .with_guessed_format()
        .map_err(|e| e.to_string())?
        .decode()
        .map_err(|e| format!("No se pudo decodificar la imagen: {}", e))?;

    let resized = img.thumbnail(600, 600); // ← thumbnail + Triangle implícito

    resized
        .save_with_format(dest_path, image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Devuelve la imagen como base64 (o cadena vacía si no existe).
/// Evita el protocolo asset:// que requiere configuración extra de permisos.
#[tauri::command]
fn read_product_image(app: tauri::AppHandle, product_id: i64) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = app_dir.join("images").join(format!("{}.jpg", product_id));

    if !file_path.exists() {
        return Ok(String::new());
    }

    let bytes = fs::read(&file_path).map_err(|e| e.to_string())?;
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
fn delete_product_image(app: tauri::AppHandle, product_id: i64) -> Result<(), String> {
    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file_path = app_dir.join("images").join(format!("{}.jpg", product_id));
    if file_path.exists() {
        fs::remove_file(file_path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn backup_database(app: tauri::AppHandle, dest_path: String) -> Result<String, String> {
    use chrono::Local;

    let app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let src_db = app_dir.join("inventario.db");
    if !src_db.exists() {
        return Err("No se encontró inventario.db".to_string());
    }

    let dest_dir = PathBuf::from(dest_path);
    if !dest_dir.exists() {
        fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    }

    let date = Local::now().format("%Y-%m-%d").to_string();
    let mut dest_file = dest_dir.join(format!("inventario_{}.db", date));

    // Evita sobrescribir si ya existe: añade sufijo HHMMSS
    if dest_file.exists() {
        let time = Local::now().format("%H%M%S").to_string();
        dest_file = dest_dir.join(format!("inventario_{}_{}.db", date, time));
    }

    fs::copy(&src_db, &dest_file).map_err(|e| e.to_string())?;
    Ok(dest_file.to_string_lossy().to_string())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_product_image, save_product_image_from_path, read_product_image, delete_product_image, backup_database])
        .plugin(
            Builder::default()
                .add_migrations(
                    "sqlite:inventario.db",
                    vec![
                        Migration {
                            version: 1,
                            description: "schema completo",
                            sql: "
                                CREATE TABLE IF NOT EXISTS departamentos (
                                    id     INTEGER PRIMARY KEY,
                                    nombre TEXT NOT NULL
                                );

                                CREATE TABLE IF NOT EXISTS productos (
                                    id             INTEGER PRIMARY KEY,
                                    codigo         TEXT,
                                    nombre         TEXT NOT NULL,
                                    departamento_id INTEGER REFERENCES departamentos(id),
                                    color          TEXT,
                                    foto           TEXT
                                );

                                CREATE TABLE IF NOT EXISTS tallas (
                                    id          INTEGER PRIMARY KEY,
                                    producto_id INTEGER NOT NULL REFERENCES productos(id),
                                    talla       TEXT    NOT NULL,
                                    stock       INTEGER NOT NULL DEFAULT 0,
                                    UNIQUE(producto_id, talla)
                                );

                                CREATE TABLE IF NOT EXISTS movimientos (
                                    id       INTEGER PRIMARY KEY,
                                    talla_id INTEGER NOT NULL REFERENCES tallas(id),
                                    cambio   INTEGER NOT NULL,
                                    origen   TEXT NOT NULL DEFAULT 'manual',
                                    fecha    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
                                );

                                CREATE TABLE IF NOT EXISTS pedidos (
                                    id             INTEGER PRIMARY KEY,
                                    fecha          TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                                    recibido       INTEGER NOT NULL DEFAULT 0,
                                    fecha_recibido TEXT
                                );

                                CREATE TABLE IF NOT EXISTS pedido_items (
                                    id        INTEGER PRIMARY KEY,
                                    pedido_id INTEGER NOT NULL REFERENCES pedidos(id),
                                    talla_id  INTEGER NOT NULL REFERENCES tallas(id),
                                    cantidad  INTEGER NOT NULL
                                );

                                CREATE TABLE IF NOT EXISTS colores (
                                    id     INTEGER PRIMARY KEY,
                                    nombre TEXT NOT NULL UNIQUE
                                );

                                INSERT INTO colores (nombre) VALUES
                                    ('Azul marino'),
                                    ('Azul celeste'),
                                    ('Blanco'),
                                    ('Negro'),
                                    ('Rojo'),
                                    ('Verde');
                            ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 2,
                            description: "columna borrador en pedidos",
                            sql: "
                                ALTER TABLE pedidos ADD COLUMN borrador INTEGER NOT NULL DEFAULT 0;
                            ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 3,
                            description: "notas en pedidos",
                            sql: "
                                ALTER TABLE pedidos ADD COLUMN notas TEXT;
                            ",
                            kind: MigrationKind::Up,
                        },
                        Migration {
                            version: 4,
                            description: "recepción parcial y modificaciones por línea",
                            sql: "
                                ALTER TABLE pedido_items ADD COLUMN cantidad_acordada INTEGER;
                                ALTER TABLE pedido_items ADD COLUMN cantidad_recibida INTEGER NOT NULL DEFAULT 0;
                                ALTER TABLE pedido_items ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente';
                            ",
                            kind: MigrationKind::Up,
                        },
                    ],
                )
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_dir = app.path().app_data_dir()?;
            let images_dir = app_dir.join("images");
            if !images_dir.exists() {
                fs::create_dir_all(&images_dir)?;
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
