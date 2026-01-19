app_name = "rustic_translator"
app_title = "Rustic Translator"
app_publisher = "Ammsamm"
app_description = "Translation management system for ERPNext"
app_email = "ammsamm@example.com"
app_license = "MIT"

# Fixtures
# --------
fixtures = [
    {"dt": "Role", "filters": [["role_name", "=", "Translation Manager"]]}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
app_include_css = "/assets/rustic_translator/css/rustic_translator.css"
# app_include_js = "/assets/rustic_translator/js/rustic_translator.js"

# include js, css files in header of web template
# web_include_css = "/assets/rustic_translator/css/rustic_translator.css"
# web_include_js = "/assets/rustic_translator/js/rustic_translator.js"

# include custom scss in every website theme (without signing in)
# website_theme_scss = "rustic_translator/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
page_js = {"translation-editor": "public/js/translation_editor.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "rustic_translator/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
#	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
#	"methods": "rustic_translator.utils.jinja_methods",
#	"filters": "rustic_translator.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "rustic_translator.install.before_install"
# after_install = "rustic_translator.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "rustic_translator.uninstall.before_uninstall"
# after_uninstall = "rustic_translator.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "rustic_translator.utils.before_app_install"
# after_app_install = "rustic_translator.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "rustic_translator.utils.before_app_uninstall"
# after_app_uninstall = "rustic_translator.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "rustic_translator.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
#	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
#	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
#	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
#	"*": {
#		"on_update": "method",
#		"on_cancel": "method",
#		"on_trash": "method"
#	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
#	"all": [
#		"rustic_translator.tasks.all"
#	],
#	"daily": [
#		"rustic_translator.tasks.daily"
#	],
#	"hourly": [
#		"rustic_translator.tasks.hourly"
#	],
#	"weekly": [
#		"rustic_translator.tasks.weekly"
#	],
#	"monthly": [
#		"rustic_translator.tasks.monthly"
#	],
# }

# Testing
# -------

# before_tests = "rustic_translator.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
#	"frappe.desk.doctype.event.event.get_events": "rustic_translator.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the hierarchical dependencies of the original method
# (for references, currentframes, and stack)

# Override link query behavior
# ----------------------------

# link_title_doctypes = {
#	"ToDo": "custom_title"
# }

# other_link_titles = {
#	"Link Title": "get_link_title"
# }

# Translation
# --------------------------------

# Make link fields search translated document names for these DocTypes
# Needs 'Translated DocType Names' enabled in Frappe Settings
# translated_search_doctypes = []

# User Data Protection
# --------------------

# user_data_fields = [
#	{
#		"doctype": "{doctype_1}",
#		"filter_by": "{filter_by}",
#		"redact_fields": ["{field_1}", "{field_2}"],
#		"partial": 1,
#	},
#	{
#		"doctype": "{doctype_2}",
#		"filter_by": "{filter_by}",
#		"partial": 1,
#	},
#	{
#		"doctype": "{doctype_3}",
#		"strict": False,
#	},
#	{
#		"doctype": "{doctype_4}"
#	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
#	"rustic_translator.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
#	"Logging DocType Name": 30  # days to retain logs
# }
