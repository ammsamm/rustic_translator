# Copyright (c) 2024, Ammsamm and contributors
# For license information, please see license.txt

import frappe
import csv
import os
import shutil
from frappe import _
from frappe.utils import now_datetime, get_bench_path


def check_translation_manager_permission():
    """Check if user has Translation Manager role"""
    if not frappe.has_permission("Translation Edit Session", "read"):
        frappe.throw(_("You don't have permission to access translation management"), frappe.PermissionError)


def get_apps_path():
    """Get the path to the apps directory"""
    return os.path.join(get_bench_path(), "apps")


def get_translation_file_path(app_name, language_code):
    """Get the full path to a translation CSV file"""
    apps_path = get_apps_path()
    return os.path.join(apps_path, app_name, app_name, "translations", f"{language_code}.csv")


@frappe.whitelist()
def get_available_apps():
    """Get list of installed apps that have translations directory"""
    check_translation_manager_permission()

    apps_path = get_apps_path()
    available_apps = []

    for app_name in os.listdir(apps_path):
        app_path = os.path.join(apps_path, app_name)
        translations_path = os.path.join(app_path, app_name, "translations")

        if os.path.isdir(translations_path):
            available_apps.append(app_name)

    return sorted(available_apps)


@frappe.whitelist()
def get_available_languages(app_name):
    """Get list of available language files for an app"""
    check_translation_manager_permission()

    translations_path = os.path.join(get_apps_path(), app_name, app_name, "translations")
    languages = []

    if os.path.isdir(translations_path):
        for filename in os.listdir(translations_path):
            if filename.endswith(".csv") and not filename.startswith("."):
                lang_code = filename[:-4]  # Remove .csv extension
                languages.append(lang_code)

    return sorted(languages)


@frappe.whitelist()
def load_translations(app_name, language_code):
    """Load translations from CSV file and return as JSON"""
    check_translation_manager_permission()

    file_path = get_translation_file_path(app_name, language_code)

    if not os.path.exists(file_path):
        frappe.throw(_("Translation file not found: {0}").format(file_path))

    # Get file modification time for debugging
    file_mtime = os.path.getmtime(file_path)
    file_mtime_str = now_datetime().strftime("%Y-%m-%d %H:%M:%S")

    translations = []

    with open(file_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for idx, row in enumerate(reader):
            if len(row) >= 2:
                source_text = row[0]
                translated_text = row[1]
                context = row[2] if len(row) > 2 else ""

                translations.append({
                    "id": idx,
                    "source_text": source_text,
                    "translated_text": translated_text,
                    "context": context
                })

    # Get first 3 translations for debugging
    debug_first_3 = []
    for t in translations[:3]:
        debug_first_3.append({
            "source": t["source_text"][:30],
            "translated": t["translated_text"][:30] if t["translated_text"] else ""
        })

    return {
        "translations": translations,
        "total_count": len(translations),
        "file_path": file_path,
        "file_mtime": file_mtime,
        "loaded_at": file_mtime_str,
        "debug_first_3": debug_first_3
    }


@frappe.whitelist()
def save_translations(app_name, language_code, translations, site_name=None, session_name=None):
    """
    Save translations to CSV file
    - Creates backup before saving
    - Clears translation cache
    - Handles rollback on failure
    """
    import json as json_module

    check_translation_manager_permission()

    file_path = get_translation_file_path(app_name, language_code)

    # Verify file exists and is writable
    if not os.path.exists(file_path):
        frappe.throw(_("Translation file not found: {0}").format(file_path))

    if not os.access(file_path, os.W_OK):
        frappe.throw(_("No write permission for file: {0}").format(file_path))

    # Parse translations - handle both string and list
    if isinstance(translations, str):
        try:
            translations = json_module.loads(translations)
        except json_module.JSONDecodeError as e:
            frappe.throw(_("Invalid JSON format: {0}").format(str(e)))

    if isinstance(translations, dict):
        translations = list(translations.values()) if translations else []

    if not isinstance(translations, list):
        frappe.throw(_("Invalid translations format. Expected list, got {0}").format(type(translations).__name__))

    if len(translations) == 0:
        frappe.throw(_("No translations to save"))

    # Get settings
    settings = frappe.get_single("Translation Manager Settings")
    backup_retention = settings.backup_retention_count or 10

    if not site_name:
        site_name = settings.default_site or frappe.local.site

    # Create backup first
    backup_path = create_backup(app_name, language_code, file_path, session_name)

    try:
        # Write new translations to CSV
        rows_written = 0
        with open(file_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            for trans in translations:
                if not isinstance(trans, dict):
                    continue

                source = trans.get("source_text", "")
                translated = trans.get("translated_text", "")
                context = trans.get("context", "")

                if not source:  # Skip empty source texts
                    continue

                row = [source, translated]
                if context:
                    row.append(context)
                writer.writerow(row)
                rows_written += 1

        # Verify file was written
        if not os.path.exists(file_path):
            frappe.throw(_("File write failed - file does not exist after write"))

        file_size = os.path.getsize(file_path)
        if file_size == 0:
            # Restore from backup if file is empty
            if backup_path and os.path.exists(backup_path):
                shutil.copy2(backup_path, file_path)
            frappe.throw(_("File write failed - file is empty after write"))

        # Verify by reading back the file
        verification_count = 0
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                verification_count += 1

        # Import translations to database and clear cache
        execute_bench_commands(site_name, app_name, language_code, file_path)

        # Update settings
        settings.last_edited_by = frappe.session.user
        settings.last_edited_on = now_datetime()
        settings.save(ignore_permissions=True)

        # Commit database changes
        frappe.db.commit()

        # Cleanup old backups
        cleanup_old_backups(app_name, language_code, backup_retention)

        return {
            "success": True,
            "message": _("Translations saved successfully"),
            "backup_path": backup_path,
            "file_path": file_path,
            "rows_written": rows_written,
            "file_size": file_size,
            "verification_count": verification_count
        }

    except Exception as e:
        # Rollback: restore from backup
        if backup_path and os.path.exists(backup_path):
            shutil.copy2(backup_path, file_path)

        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), "Translation Save Error")
        frappe.throw(_("Failed to save translations: {0}").format(str(e)))


def create_backup(app_name, language_code, file_path, session_name=None):
    """Create a backup of the translation file"""
    timestamp = now_datetime().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"{language_code}.csv.backup.{timestamp}"
    backup_dir = os.path.dirname(file_path)
    backup_path = os.path.join(backup_dir, backup_filename)

    # Copy the file
    shutil.copy2(file_path, backup_path)

    # Create backup record
    backup_doc = frappe.get_doc({
        "doctype": "Translation Backup",
        "app_name": app_name,
        "language_code": language_code,
        "file_path": backup_path,
        "is_active": 1,
        "backup_timestamp": now_datetime(),
        "session": session_name
    })
    backup_doc.insert(ignore_permissions=True)

    return backup_path


def cleanup_old_backups(app_name, language_code, retention_count):
    """Remove old backups beyond retention limit"""
    backups = frappe.get_all(
        "Translation Backup",
        filters={
            "app_name": app_name,
            "language_code": language_code,
            "is_active": 1
        },
        fields=["name", "file_path", "backup_timestamp"],
        order_by="backup_timestamp desc"
    )

    # Keep only the most recent backups
    if len(backups) > retention_count:
        for backup in backups[retention_count:]:
            # Delete physical file
            if os.path.exists(backup.file_path):
                try:
                    os.remove(backup.file_path)
                except Exception:
                    pass

            # Delete record
            frappe.delete_doc("Translation Backup", backup.name, ignore_permissions=True)


def import_translations_to_db(app_name, language_code, file_path):
    """Import translations from CSV file into the database"""
    try:
        # Read CSV directly without Frappe's validation
        translations = []
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if len(row) >= 2:
                    translations.append(row)

        if not translations:
            return False

        imported_count = 0

        for trans in translations:
            source_text = trans[0].strip() if trans[0] else ""
            translated_text = trans[1].strip() if len(trans) > 1 and trans[1] else ""
            context = trans[2].strip() if len(trans) > 2 and trans[2] else None

            # Skip empty source or translation
            if not source_text or not translated_text:
                continue

            # Check if translation already exists
            existing = frappe.db.get_value("Translation", {
                "language": language_code,
                "source_text": source_text
            }, "name")

            if existing:
                frappe.db.set_value("Translation", existing, "translated_text", translated_text, update_modified=False)
            else:
                frappe.db.sql("""
                    INSERT INTO `tabTranslation` (name, language, source_text, translated_text, context, creation, modified, owner, modified_by)
                    VALUES (%s, %s, %s, %s, %s, NOW(), NOW(), %s, %s)
                """, (
                    frappe.generate_hash(length=10),
                    language_code,
                    source_text,
                    translated_text,
                    context,
                    frappe.session.user,
                    frappe.session.user
                ))

            imported_count += 1

        frappe.db.commit()
        frappe.log_error(f"Imported {imported_count} translations for {language_code}", "Translation Import Success")
        return True

    except Exception as e:
        frappe.log_error(f"Translation import error: {str(e)}\n{frappe.get_traceback()}", "Translation Import Error")
        return False


def execute_bench_commands(site_name, app_name=None, language_code=None, file_path=None):
    """Import translations to DB and clear cache after saving"""
    try:
        # Import translations into database
        if app_name and language_code and file_path:
            import_translations_to_db(app_name, language_code, file_path)

        # Clear Frappe's translation cache
        frappe.cache().delete_key("lang_full_dict")
        frappe.cache().delete_key("lang_user_translations")
        frappe.cache().delete_keys("lang_*")

        # Clear general cache
        frappe.clear_cache()

        # Reload translations for current session
        if hasattr(frappe.local, 'lang'):
            frappe.local.lang_full_dict = None

    except Exception as e:
        frappe.log_error(f"Cache clear error: {str(e)}", "Translation Cache Error")


@frappe.whitelist()
def restore_from_backup(backup_name):
    """Restore a translation file from backup"""
    check_translation_manager_permission()

    backup = frappe.get_doc("Translation Backup", backup_name)

    if not os.path.exists(backup.file_path):
        frappe.throw(_("Backup file not found: {0}").format(backup.file_path))

    # Get target file path
    target_path = get_translation_file_path(backup.app_name, backup.language_code)

    # Create a backup of current state before restoring
    create_backup(backup.app_name, backup.language_code, target_path)

    # Restore from backup
    shutil.copy2(backup.file_path, target_path)

    # Import to database and clear cache
    settings = frappe.get_single("Translation Manager Settings")
    site_name = settings.default_site or frappe.local.site
    execute_bench_commands(site_name, backup.app_name, backup.language_code, target_path)

    return {
        "success": True,
        "message": _("Translation restored from backup successfully")
    }


@frappe.whitelist()
def get_backups(app_name=None, language_code=None):
    """Get list of available backups"""
    check_translation_manager_permission()

    filters = {"is_active": 1}

    if app_name:
        filters["app_name"] = app_name
    if language_code:
        filters["language_code"] = language_code

    backups = frappe.get_all(
        "Translation Backup",
        filters=filters,
        fields=["name", "app_name", "language_code", "file_path", "backup_timestamp", "session"],
        order_by="backup_timestamp desc",
        limit=50
    )

    return backups


@frappe.whitelist()
def create_edit_session(app_name, language_code, site_name=None):
    """Create a new translation edit session"""
    check_translation_manager_permission()

    settings = frappe.get_single("Translation Manager Settings")

    if not site_name:
        site_name = settings.default_site or frappe.local.site

    session = frappe.get_doc({
        "doctype": "Translation Edit Session",
        "app_name": app_name,
        "language_code": language_code,
        "site_name": site_name,
        "status": "In Progress"
    })
    session.insert()

    return session.name


@frappe.whitelist()
def log_translation_change(session_name, app_name, source_text, old_translation, new_translation, context=None):
    """Log a single translation change"""
    check_translation_manager_permission()

    log = frappe.get_doc({
        "doctype": "Translation Edit Log",
        "session": session_name,
        "app_name": app_name,
        "source_text": source_text,
        "old_translation": old_translation,
        "new_translation": new_translation,
        "context": context
    })
    log.insert(ignore_permissions=True)

    return log.name


@frappe.whitelist()
def complete_edit_session(session_name, modified_count=0):
    """Mark an edit session as completed"""
    check_translation_manager_permission()

    session = frappe.get_doc("Translation Edit Session", session_name)
    session.status = "Completed"
    session.modified_count = modified_count
    session.save()

    return {"success": True}
