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

    return {
        "translations": translations,
        "total_count": len(translations),
        "file_path": file_path
    }


@frappe.whitelist()
def save_translations(app_name, language_code, translations, site_name=None, session_name=None):
    """
    Save translations to CSV file
    - Creates backup before saving
    - Executes safe bench commands
    - Handles rollback on failure
    """
    check_translation_manager_permission()

    file_path = get_translation_file_path(app_name, language_code)

    if not os.path.exists(file_path):
        frappe.throw(_("Translation file not found: {0}").format(file_path))

    # Parse translations if string
    if isinstance(translations, str):
        import json
        translations = json.loads(translations)

    # Get settings
    settings = frappe.get_single("Translation Manager Settings")
    backup_retention = settings.backup_retention_count or 10

    if not site_name:
        site_name = settings.default_site or frappe.local.site

    # Create backup
    backup_path = create_backup(app_name, language_code, file_path, session_name)

    try:
        # Write new translations to CSV
        with open(file_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f)
            for trans in translations:
                row = [trans.get("source_text", ""), trans.get("translated_text", "")]
                if trans.get("context"):
                    row.append(trans.get("context"))
                writer.writerow(row)

        # Execute safe bench commands
        execute_bench_commands(site_name)

        # Update settings
        settings.last_edited_by = frappe.session.user
        settings.last_edited_on = now_datetime()
        settings.save(ignore_permissions=True)

        # Cleanup old backups
        cleanup_old_backups(app_name, language_code, backup_retention)

        return {
            "success": True,
            "message": _("Translations saved successfully"),
            "backup_path": backup_path
        }

    except Exception as e:
        # Rollback: restore from backup
        if backup_path and os.path.exists(backup_path):
            shutil.copy2(backup_path, file_path)

        frappe.log_error(f"Translation save failed: {str(e)}", "Translation Error")
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


def execute_bench_commands(site_name):
    """Clear translation cache after saving translations"""
    try:
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

    # Clear cache
    settings = frappe.get_single("Translation Manager Settings")
    site_name = settings.default_site or frappe.local.site
    execute_bench_commands(site_name)

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
