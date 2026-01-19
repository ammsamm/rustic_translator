# Copyright (c) 2024, Ammsamm and contributors
# For license information, please see license.txt

import frappe
import os
from frappe.model.document import Document


class TranslationBackup(Document):
    def on_trash(self):
        """Delete the physical backup file when the record is deleted"""
        if self.file_path and os.path.exists(self.file_path):
            try:
                os.remove(self.file_path)
            except Exception as e:
                frappe.log_error(f"Failed to delete backup file {self.file_path}: {str(e)}")
