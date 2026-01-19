frappe.pages['translation-editor'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Translation Editor'),
        single_column: true
    });

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

    getTemplate() {
        return `
            <div class="translation-editor-container">
                <div class="te-header">
                    <h2>Translation Editor</h2>
                    <p class="text-muted">Edit ERPNext translation CSV files</p>
                </div>

                <div class="te-controls">
                    <div class="row">
                        <div class="col-md-3">
                            <label class="control-label">App</label>
                            <select class="form-control" v-model="selectedApp" @change="onAppChange">
                                <option value="">Select App</option>
                                <option v-for="app in apps" :key="app" :value="app">{{ app }}</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="control-label">Language</label>
                            <select class="form-control" v-model="selectedLanguage" @change="onLanguageChange" :disabled="!selectedApp">
                                <option value="">Select Language</option>
                                <option v-for="lang in languages" :key="lang" :value="lang">{{ lang }}</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="control-label">Filter</label>
                            <select class="form-control" v-model="filterMode">
                                <option value="all">All Translations</option>
                                <option value="empty">Empty Only</option>
                                <option value="modified">Modified Only</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="control-label">Search</label>
                            <input type="text" class="form-control" v-model="searchQuery" placeholder="Search source or translation...">
                        </div>
                    </div>
                </div>

                <div class="te-actions" v-if="translations.length > 0">
                    <button class="btn btn-primary btn-sm" @click="loadTranslations" :disabled="loading">
                        <i class="fa fa-refresh"></i> Reload
                    </button>
                    <button class="btn btn-success btn-sm" @click="saveTranslations" :disabled="!hasChanges || saving">
                        <i class="fa fa-save"></i> Save Changes
                        <span v-if="modifiedCount > 0" class="te-badge">{{ modifiedCount }}</span>
                    </button>
                    <button class="btn btn-warning btn-sm" @click="discardChanges" :disabled="!hasChanges">
                        <i class="fa fa-undo"></i> Discard Changes
                    </button>
                    <button class="btn btn-default btn-sm" @click="showBackups">
                        <i class="fa fa-history"></i> Backups
                    </button>
                    <span class="te-stats text-muted">
                        Showing {{ filteredTranslations.length }} of {{ translations.length }} translations
                        <span v-if="emptyCount > 0" class="text-danger"> | {{ emptyCount }} empty</span>
                    </span>
                </div>

                <div v-if="loading" class="te-loading">
                    <i class="fa fa-spinner fa-spin fa-2x"></i>
                    <p>Loading translations...</p>
                </div>

                <div v-if="translations.length > 2000 && filterMode === 'all'" class="alert alert-warning">
                    <i class="fa fa-exclamation-triangle"></i>
                    Large dataset detected. Consider using a filter to improve performance.
                </div>

                <div class="te-grid-container" v-if="!loading && translations.length > 0">
                    <table class="table te-grid">
                        <thead>
                            <tr>
                                <th class="te-col-index">#</th>
                                <th class="te-col-source">Source Text</th>
                                <th class="te-col-translation">Translation</th>
                                <th class="te-col-context">Context</th>
                                <th class="te-col-length">Length</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(trans, index) in paginatedTranslations"
                                :key="trans.id"
                                :class="getRowClass(trans)">
                                <td class="te-col-index">{{ getRowIndex(index) }}</td>
                                <td class="te-col-source">
                                    <div class="te-source-text">{{ trans.source_text }}</div>
                                </td>
                                <td class="te-col-translation">
                                    <textarea
                                        class="form-control te-translation-input"
                                        :class="{'te-empty': !trans.translated_text, 'te-modified': isModified(trans)}"
                                        v-model="trans.translated_text"
                                        @input="markModified(trans)"
                                        rows="2"
                                    ></textarea>
                                </td>
                                <td class="te-col-context">
                                    <span class="te-context">{{ trans.context || '-' }}</span>
                                </td>
                                <td class="te-col-length">
                                    <span :class="getLengthClass(trans)">
                                        {{ (trans.translated_text || '').length }} / {{ trans.source_text.length }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="te-pagination" v-if="totalPages > 1">
                    <button class="btn btn-default btn-sm" @click="prevPage" :disabled="currentPage === 1">
                        <i class="fa fa-chevron-left"></i> Previous
                    </button>
                    <span class="te-page-info">
                        Page {{ currentPage }} of {{ totalPages }}
                    </span>
                    <button class="btn btn-default btn-sm" @click="nextPage" :disabled="currentPage === totalPages">
                        Next <i class="fa fa-chevron-right"></i>
                    </button>
                    <select class="form-control te-page-size" v-model.number="pageSize">
                        <option :value="50">50 per page</option>
                        <option :value="100">100 per page</option>
                        <option :value="200">200 per page</option>
                    </select>
                </div>

                <div v-if="!loading && translations.length === 0 && selectedApp && selectedLanguage" class="te-empty-state">
                    <i class="fa fa-file-text-o fa-3x text-muted"></i>
                    <p>No translations found for this selection.</p>
                </div>

                <div v-if="!loading && !selectedApp" class="te-empty-state">
                    <i class="fa fa-language fa-3x text-muted"></i>
                    <p>Select an app and language to start editing translations.</p>
                </div>
            </div>
        `;
    }

    setupVue() {
        const self = this;
        const vm = new Vue({
            el: '#translation-editor-app',
            template: self.getTemplate(),
            data: {
                apps: [],
                languages: [],
                selectedApp: '',
                selectedLanguage: '',
                translations: [],
                originalTranslations: {},
                loading: false,
                saving: false,
                searchQuery: '',
                filterMode: 'all',
                currentPage: 1,
                pageSize: 100,
                sessionName: null
            },

            computed: {
                filteredTranslations() {
                    let result = this.translations;

                    if (this.searchQuery) {
                        const query = this.searchQuery.toLowerCase();
                        result = result.filter(t =>
                            t.source_text.toLowerCase().includes(query) ||
                            (t.translated_text || '').toLowerCase().includes(query) ||
                            (t.context || '').toLowerCase().includes(query)
                        );
                    }

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

                        this.originalTranslations = {};
                        this.translations.forEach(t => {
                            this.originalTranslations[t.id] = t.translated_text || '';
                        });

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
                            this.translations.forEach(t => {
                                this.originalTranslations[t.id] = t.translated_text || '';
                            });

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
                                label: b.backup_timestamp + ' - ' + b.app_name + '/' + b.language_code,
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
                    // Vue reactivity handles this
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
