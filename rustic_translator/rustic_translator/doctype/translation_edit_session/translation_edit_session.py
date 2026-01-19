# Copyright (c) 2024, Ammsamm and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime


class TranslationEditSession(Document):
    def before_insert(self):
        self.session_name = f"{self.app_name}-{self.language_code}-{now_datetime().strftime('%Y%m%d%H%M%S')}"
