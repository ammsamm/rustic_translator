"""
Export Arabic translations from Translation DocType back to ar.csv.

Usage (from bench directory):
    bench --site rustic.works execute rustic_translator.export_translations.export

This keeps ar.csv in sync with translations edited via the website UI.
After running, commit and push the updated ar.csv.
"""

import csv
import os

import frappe


def export():
    """Export all Arabic translations from DB to translations/ar.csv."""
    translations = frappe.db.sql(
        """
        SELECT source_text, translated_text
        FROM tabTranslation
        WHERE language = 'ar'
          AND source_text IS NOT NULL
          AND source_text != ''
          AND translated_text IS NOT NULL
          AND translated_text != ''
        ORDER BY source_text
        """,
        as_dict=True,
    )

    csv_path = os.path.join(
        os.path.dirname(__file__),
        "translations", "ar.csv",
    )

    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        for t in translations:
            writer.writerow([t.source_text, t.translated_text])

    print(f"Exported {len(translations)} translations to {csv_path}")
