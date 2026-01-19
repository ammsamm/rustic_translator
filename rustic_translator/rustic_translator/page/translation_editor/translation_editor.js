frappe.pages['translation-editor'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Translation Editor'),
        single_column: true
    });

    // Load Vue.js component
    new TranslationEditorApp(page);
};

class TranslationEditorApp {
    constructor(page) {
        this.page = page;
        this.init();
    }

    init() {
        this.page.main.html(frappe.render_template('translation_editor'));
        this.setupVue();
    }

    setupVue() {
        const vm = new Vue({
            el: '#translation-editor-app',
            data: {
                // Selection state
                apps: [],
                languages: [],
                selectedApp: '',
                selectedLanguage: '',

                // Translations data
                translations: [],
                originalTranslations: {},  // Store original values for comparison

                // UI state
                loading: false,
                saving: false,
                searchQuery: '',
                filterMode: 'all',

                // Pagination
                currentPage: 1,
                pageSize: 100,

                // Session
                sessionName: null
            },

            computed: {
                filteredTranslations() {
                    let result = this.translations;

                    // Apply search filter
                    if (this.searchQuery) {
                        const query = this.searchQuery.toLowerCase();
                        result = result.filter(t =>
                            t.source_text.toLowerCase().includes(query) ||
                            (t.translated_text || '').toLowerCase().includes(query) ||
                            (t.context || '').toLowerCase().includes(query)
                        );
                    }

                    // Apply status filter
                    if (this.filterMode === 'empty') {
                        result = result.filter(t => !t.translated_text || t.translated_text.trim() === '');
                    } else if (this.filterMode === 'modified') {
                        result = result.filter(t => this.isModified(t));
                    }

                    return result;
                },

                paginatedTranslations() {
                    const start = (this.currentPage - 1) * this.pageSize;
                    const end = start + this.pageSize;
                    return this.filteredTranslations.slice(start, end);
                },

                totalPages() {
                    return Math.ceil(this.filteredTranslations.length / this.pageSize);
                },

                hasChanges() {
                    return this.modifiedCount > 0;
                },

                modifiedCount() {
                    return this.translations.filter(t => this.isModified(t)).length;
                },

                emptyCount() {
                    return this.translations.filter(t => !t.translated_text || t.translated_text.trim() === '').length;
                }
            },

            methods: {
                async loadApps() {
                    try {
                        const response = await frappe.call({
                            method: 'rustic_translator.api.translation.get_available_apps'
                        });
                        this.apps = response.message || [];
                    } catch (error) {
                        frappe.msgprint({
                            title: __('Error'),
                            indicator: 'red',
                            message: __('Failed to load apps: {0}', [error.message || error])
                        });
                    }
                },

                async onAppChange() {
                    this.selectedLanguage = '';
                    this.translations = [];
                    this.languages = [];

                    if (this.selectedApp) {
                        try {
                            const response = await frappe.call({
                                method: 'rustic_translator.api.translation.get_available_languages',
                                args: { app_name: this.selectedApp }
                            });
                            this.languages = response.message || [];
                        } catch (error) {
                            frappe.msgprint({
                                title: __('Error'),
                                indicator: 'red',
                                message: __('Failed to load languages: {0}', [error.message || error])
                            });
                        }
                    }
                },

                async onLanguageChange() {
                    if (this.selectedApp && this.selectedLanguage) {
                        await this.loadTranslations();
                    }
                },

                async loadTranslations() {
                    if (!this.selectedApp || !this.selectedLanguage) return;

                    this.loading = true;
                    this.currentPage = 1;

                    try {
                        const response = await frappe.call({
                            method: 'rustic_translator.api.translation.load_translations',
                            args: {
                                app_name: this.selectedApp,
                                language_code: this.selectedLanguage
                            }
                        });

                        const data = response.message;
                        this.translations = data.translations || [];

                        // Store original values
                        this.originalTranslations = {};
                        this.translations.forEach(t => {
                            this.originalTranslations[t.id] = t.translated_text || '';
                        });

                        // Create edit session
                        await this.createSession();

                    } catch (error) {
                        frappe.msgprint({
                            title: __('Error'),
                            indicator: 'red',
                            message: __('Failed to load translations: {0}', [error.message || error])
                        });
                    } finally {
                        this.loading = false;
                    }
                },

                async createSession() {
                    try {
                        const response = await frappe.call({
                            method: 'rustic_translator.api.translation.create_edit_session',
                            args: {
                                app_name: this.selectedApp,
                                language_code: this.selectedLanguage
                            }
                        });
                        this.sessionName = response.message;
                    } catch (error) {
                        console.error('Failed to create session:', error);
                    }
                },

                async saveTranslations() {
                    if (!this.hasChanges) return;

                    this.saving = true;

                    try {
                        // Log changes before saving
                        const modifiedTranslations = this.translations.filter(t => this.isModified(t));

                        for (const trans of modifiedTranslations) {
                            await frappe.call({
                                method: 'rustic_translator.api.translation.log_translation_change',
                                args: {
                                    session_name: this.sessionName,
                                    app_name: this.selectedApp,
                                    source_text: trans.source_text,
                                    old_translation: this.originalTranslations[trans.id] || '',
                                    new_translation: trans.translated_text || '',
                                    context: trans.context
                                }
                            });
                        }

                        // Save translations
                        const response = await frappe.call({
                            method: 'rustic_translator.api.translation.save_translations',
                            args: {
                                app_name: this.selectedApp,
                                language_code: this.selectedLanguage,
                                translations: this.translations,
                                session_name: this.sessionName
                            }
                        });

                        if (response.message && response.message.success) {
                            // Update original values
                            this.translations.forEach(t => {
                                this.originalTranslations[t.id] = t.translated_text || '';
                            });

                            // Complete session
                            await frappe.call({
                                method: 'rustic_translator.api.translation.complete_edit_session',
                                args: {
                                    session_name: this.sessionName,
                                    modified_count: modifiedTranslations.length
                                }
                            });

                            frappe.show_alert({
                                message: __('Translations saved successfully!'),
                                indicator: 'green'
                            });

                            // Create new session for future edits
                            await this.createSession();
                        }

                    } catch (error) {
                        frappe.msgprint({
                            title: __('Error'),
                            indicator: 'red',
                            message: __('Failed to save translations: {0}', [error.message || error])
                        });
                    } finally {
                        this.saving = false;
                    }
                },

                discardChanges() {
                    frappe.confirm(
                        __('Are you sure you want to discard all changes?'),
                        () => {
                            this.translations.forEach(t => {
                                t.translated_text = this.originalTranslations[t.id] || '';
                            });
                            frappe.show_alert({
                                message: __('Changes discarded'),
                                indicator: 'blue'
                            });
                        }
                    );
                },

                showBackups() {
                    frappe.call({
                        method: 'rustic_translator.api.translation.get_backups',
                        args: {
                            app_name: this.selectedApp,
                            language_code: this.selectedLanguage
                        },
                        callback: (r) => {
                            const backups = r.message || [];

                            if (backups.length === 0) {
                                frappe.msgprint(__('No backups available.'));
                                return;
                            }

                            const options = backups.map(b => ({
                                label: `${b.backup_timestamp} - ${b.app_name}/${b.language_code}`,
                                value: b.name
                            }));

                            const dialog = new frappe.ui.Dialog({
                                title: __('Restore from Backup'),
                                fields: [
                                    {
                                        fieldname: 'backup',
                                        fieldtype: 'Select',
                                        label: __('Select Backup'),
                                        options: options.map(o => o.value).join('\n'),
                                        reqd: 1
                                    }
                                ],
                                primary_action_label: __('Restore'),
                                primary_action: (values) => {
                                    this.restoreBackup(values.backup);
                                    dialog.hide();
                                }
                            });

                            dialog.show();
                        }
                    });
                },

                async restoreBackup(backupName) {
                    try {
                        const response = await frappe.call({
                            method: 'rustic_translator.api.translation.restore_from_backup',
                            args: { backup_name: backupName }
                        });

                        if (response.message && response.message.success) {
                            frappe.show_alert({
                                message: __('Backup restored successfully!'),
                                indicator: 'green'
                            });
                            await this.loadTranslations();
                        }
                    } catch (error) {
                        frappe.msgprint({
                            title: __('Error'),
                            indicator: 'red',
                            message: __('Failed to restore backup: {0}', [error.message || error])
                        });
                    }
                },

                isModified(trans) {
                    const original = this.originalTranslations[trans.id];
                    const current = trans.translated_text || '';
                    return original !== current;
                },

                markModified(trans) {
                    // Vue reactivity handles this automatically
                },

                getRowClass(trans) {
                    const classes = [];
                    if (this.isModified(trans)) {
                        classes.push('te-row-modified');
                    }
                    if (!trans.translated_text || trans.translated_text.trim() === '') {
                        classes.push('te-row-empty');
                    }
                    return classes.join(' ');
                },

                getLengthClass(trans) {
                    const sourceLen = trans.source_text.length;
                    const transLen = (trans.translated_text || '').length;
                    const ratio = transLen / sourceLen;

                    if (ratio > 2) return 'te-length-danger';
                    if (ratio > 1.5 || ratio < 0.5) return 'te-length-warning';
                    return '';
                },

                getRowIndex(index) {
                    return (this.currentPage - 1) * this.pageSize + index + 1;
                },

                prevPage() {
                    if (this.currentPage > 1) {
                        this.currentPage--;
                    }
                },

                nextPage() {
                    if (this.currentPage < this.totalPages) {
                        this.currentPage++;
                    }
                }
            },

            watch: {
                filterMode() {
                    this.currentPage = 1;
                },
                searchQuery() {
                    this.currentPage = 1;
                },
                pageSize() {
                    this.currentPage = 1;
                }
            },

            mounted() {
                this.loadApps();
            }
        });
    }
}
