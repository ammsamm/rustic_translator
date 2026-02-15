"""
Centralized Arabic translation sync for all Rustic apps.

This is the SINGLE SOURCE OF TRUTH for custom Arabic translations.
All translations live in translations/ar.csv (version-controlled).
On every `bench migrate`, this script syncs them into the Translation DocType
(highest priority in Frappe's translation system), ensuring they survive
Frappe/ERPNext updates.

Replaces the individual setup_translations hooks in erpnext_expenses and pos_next.
"""

import csv
import os

import frappe


def get_csv_path():
    """Return the absolute path to translations/ar.csv."""
    return os.path.join(
        os.path.dirname(__file__), "translations", "ar.csv"
    )


def read_csv_translations(csv_path):
    """Read translations from the CSV file.

    Returns a dict {source_text: translated_text}.
    """
    translations = {}
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) >= 2 and row[0].strip() and row[1].strip():
                translations[row[0].strip()] = row[1].strip()
    return translations


def after_migrate_sync_translations():
    """Sync translations/ar.csv into the Translation DocType.

    For each entry in the CSV:
    - If duplicates exist in DB, delete extras and keep one
    - If the kept entry differs from CSV, update it
    - If no entry exists, insert a new one

    Called via after_migrate hook in hooks.py.
    """
    csv_path = get_csv_path()
    if not os.path.exists(csv_path):
        print(f"rustic_translator: translations/ar.csv not found at {csv_path}")
        return

    translations = read_csv_translations(csv_path)
    if not translations:
        print("rustic_translator: ar.csv is empty, skipping")
        return

    # Fetch ALL existing Arabic translations from DB in one query
    existing = frappe.db.sql(
        """
        SELECT name, source_text, translated_text
        FROM tabTranslation
        WHERE language = 'ar'
        ORDER BY modified DESC
        """,
        as_dict=True,
    )

    # Build a map: source_text -> list of {name, translated_text}
    # Ordered by modified DESC (most recent first)
    existing_map = {}
    for row in existing:
        existing_map.setdefault(row.source_text, []).append(row)

    count_new = 0
    count_updated = 0
    count_deduped = 0

    for source_text, translated_text in translations.items():
        entries = existing_map.get(source_text, [])

        if len(entries) > 1:
            # Delete all duplicates, keep the first (most recently modified)
            for entry in entries[1:]:
                frappe.db.sql(
                    "DELETE FROM tabTranslation WHERE name = %s", entry.name
                )
                count_deduped += 1

        if entries:
            # Update the kept entry if translation differs
            keeper = entries[0]
            if keeper.translated_text != translated_text:
                frappe.db.sql(
                    "UPDATE tabTranslation SET translated_text = %s, modified = NOW() WHERE name = %s",
                    (translated_text, keeper.name),
                )
                count_updated += 1
        else:
            # Insert new translation
            doc = frappe.get_doc(
                {
                    "doctype": "Translation",
                    "language": "ar",
                    "source_text": source_text,
                    "translated_text": translated_text,
                }
            )
            doc.insert(ignore_permissions=True)
            count_new += 1

    if count_new or count_updated or count_deduped:
        frappe.db.commit()
        frappe.cache.delete_key("translations")
        frappe.cache.delete_key("lang_user_translations")

    print(
        f"rustic_translator: {count_new} new, {count_updated} updated, "
        f"{count_deduped} duplicates removed "
        f"(total {len(translations)} entries in ar.csv)"
    )
