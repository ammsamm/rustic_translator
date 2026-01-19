frappe.pages['translation-editor'].on_page_load = function(wrapper) {
    var page = frappe.ui.make_app_page({
        parent: wrapper,
        title: __('Translation Editor'),
        single_column: true
    });

    new TranslationEditor(wrapper, page);
};

class TranslationEditor {
    constructor(wrapper, page) {
        this.wrapper = wrapper;
        this.page = page;
        this.translations = [];
        this.originalTranslations = {};
        this.currentPage = 1;
        this.pageSize = 100;
        this.filterMode = 'all';
        this.searchQuery = '';
        this.sessionName = null;

        this.setup();
    }

    setup() {
        this.setupPageActions();
        this.renderControls();
        this.loadApps();
    }

    setupPageActions() {
        this.page.set_primary_action(__('Save Changes'), () => this.saveTranslations(), 'octicon octicon-check');
        this.page.set_secondary_action(__('Reload'), () => this.loadTranslations(), 'octicon octicon-sync');

        this.page.add_menu_item(__('Discard Changes'), () => this.discardChanges());
        this.page.add_menu_item(__('View Backups'), () => this.showBackups());
    }

    renderControls() {
        this.page.main.html(`
            <div class="translation-editor">
                <div class="te-controls frappe-card p-3 mb-3">
                    <div class="row">
                        <div class="col-md-3">
                            <label class="control-label">${__('App')}</label>
                            <select class="form-control" id="te-app-select">
                                <option value="">${__('Select App')}</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="control-label">${__('Language')}</label>
                            <select class="form-control" id="te-lang-select" disabled>
                                <option value="">${__('Select Language')}</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="control-label">${__('Filter')}</label>
                            <select class="form-control" id="te-filter-select">
                                <option value="all">${__('All Translations')}</option>
                                <option value="empty">${__('Empty Only')}</option>
                                <option value="modified">${__('Modified Only')}</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="control-label">${__('Search')}</label>
                            <input type="text" class="form-control" id="te-search" placeholder="${__('Search...')}">
                        </div>
                    </div>
                </div>
                <div class="te-stats text-muted mb-2" id="te-stats"></div>
                <div class="te-grid-container" id="te-grid-container"></div>
                <div class="te-pagination mt-3" id="te-pagination"></div>
            </div>
        `);

        this.bindEvents();
    }

    bindEvents() {
        const $wrapper = $(this.wrapper);

        $wrapper.find('#te-app-select').on('change', (e) => {
            this.onAppChange(e.target.value);
        });

        $wrapper.find('#te-lang-select').on('change', (e) => {
            this.onLanguageChange(e.target.value);
        });

        $wrapper.find('#te-filter-select').on('change', (e) => {
            this.filterMode = e.target.value;
            this.currentPage = 1;
            this.renderGrid();
        });

        $wrapper.find('#te-search').on('input', frappe.utils.debounce((e) => {
            this.searchQuery = e.target.value;
            this.currentPage = 1;
            this.renderGrid();
        }, 300));
    }

    async loadApps() {
        try {
            const response = await frappe.call({
                method: 'rustic_translator.api.translation.get_available_apps'
            });

            const apps = response.message || [];
            const $select = $(this.wrapper).find('#te-app-select');

            apps.forEach(app => {
                $select.append(`<option value="${app}">${app}</option>`);
            });
        } catch (error) {
            frappe.msgprint({
                title: __('Error'),
                indicator: 'red',
                message: __('Failed to load apps')
            });
        }
    }

    async onAppChange(appName) {
        const $langSelect = $(this.wrapper).find('#te-lang-select');
        $langSelect.html(`<option value="">${__('Select Language')}</option>`);
        $langSelect.prop('disabled', true);

        this.translations = [];
        this.renderGrid();

        if (!appName) return;

        try {
            const response = await frappe.call({
                method: 'rustic_translator.api.translation.get_available_languages',
                args: { app_name: appName }
            });

            const languages = response.message || [];
            languages.forEach(lang => {
                $langSelect.append(`<option value="${lang}">${lang}</option>`);
            });

            $langSelect.prop('disabled', false);
        } catch (error) {
            frappe.msgprint({
                title: __('Error'),
                indicator: 'red',
                message: __('Failed to load languages')
            });
        }
    }

    async onLanguageChange(langCode) {
        if (!langCode) {
            this.translations = [];
            this.renderGrid();
            return;
        }

        await this.loadTranslations();
    }

    async loadTranslations() {
        const appName = $(this.wrapper).find('#te-app-select').val();
        const langCode = $(this.wrapper).find('#te-lang-select').val();

        if (!appName || !langCode) return;

        frappe.show_progress(__('Loading'), 0, 100, __('Loading translations...'));

        try {
            const response = await frappe.call({
                method: 'rustic_translator.api.translation.load_translations',
                args: {
                    app_name: appName,
                    language_code: langCode
                }
            });

            const data = response.message;
            this.translations = data.translations || [];

            this.originalTranslations = {};
            this.translations.forEach(t => {
                this.originalTranslations[t.id] = t.translated_text || '';
            });

            this.currentPage = 1;
            await this.createSession();
            this.renderGrid();

            frappe.hide_progress();
        } catch (error) {
            frappe.hide_progress();
            frappe.msgprint({
                title: __('Error'),
                indicator: 'red',
                message: __('Failed to load translations')
            });
        }
    }

    async createSession() {
        const appName = $(this.wrapper).find('#te-app-select').val();
        const langCode = $(this.wrapper).find('#te-lang-select').val();

        try {
            const response = await frappe.call({
                method: 'rustic_translator.api.translation.create_edit_session',
                args: {
                    app_name: appName,
                    language_code: langCode
                }
            });
            this.sessionName = response.message;
        } catch (error) {
            console.error('Failed to create session:', error);
        }
    }

    getFilteredTranslations() {
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
    }

    isModified(trans) {
        const original = this.originalTranslations[trans.id];
        const current = trans.translated_text || '';
        return original !== current;
    }

    getModifiedCount() {
        return this.translations.filter(t => this.isModified(t)).length;
    }

    getEmptyCount() {
        return this.translations.filter(t => !t.translated_text || t.translated_text.trim() === '').length;
    }

    renderGrid() {
        const filtered = this.getFilteredTranslations();
        const totalPages = Math.ceil(filtered.length / this.pageSize);
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageData = filtered.slice(start, end);

        const modifiedCount = this.getModifiedCount();
        const emptyCount = this.getEmptyCount();

        $(this.wrapper).find('#te-stats').html(`
            ${__('Showing')} ${pageData.length} ${__('of')} ${filtered.length} ${__('translations')}
            (${this.translations.length} ${__('total')})
            ${modifiedCount > 0 ? `<span class="text-warning"> | ${modifiedCount} ${__('modified')}</span>` : ''}
            ${emptyCount > 0 ? `<span class="text-danger"> | ${emptyCount} ${__('empty')}</span>` : ''}
        `);

        let html = `
            <table class="table table-bordered">
                <thead>
                    <tr>
                        <th style="width: 50px">#</th>
                        <th style="width: 40%">${__('Source Text')}</th>
                        <th style="width: 40%">${__('Translation')}</th>
                        <th style="width: 10%">${__('Context')}</th>
                    </tr>
                </thead>
                <tbody>
        `;

        pageData.forEach((trans, index) => {
            const rowNum = start + index + 1;
            const isModified = this.isModified(trans);
            const isEmpty = !trans.translated_text || trans.translated_text.trim() === '';
            const rowClass = isModified ? 'table-warning' : (isEmpty ? 'table-danger' : '');

            html += `
                <tr class="${rowClass}" data-id="${trans.id}">
                    <td class="text-center">${rowNum}</td>
                    <td>
                        <div style="max-height: 80px; overflow-y: auto; word-break: break-word;">
                            ${frappe.utils.escape_html(trans.source_text)}
                        </div>
                    </td>
                    <td>
                        <textarea class="form-control te-input" data-id="${trans.id}" rows="2"
                            style="width: 100%;">${frappe.utils.escape_html(trans.translated_text || '')}</textarea>
                    </td>
                    <td class="text-muted" style="font-size: 12px;">
                        ${frappe.utils.escape_html(trans.context || '-')}
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table>';

        if (pageData.length === 0) {
            html = `
                <div class="text-center text-muted p-5">
                    <i class="fa fa-language fa-3x mb-3"></i>
                    <p>${this.translations.length === 0 ? __('Select an app and language to load translations') : __('No translations match your filter')}</p>
                </div>
            `;
        }

        $(this.wrapper).find('#te-grid-container').html(html);

        $(this.wrapper).find('.te-input').on('input', (e) => {
            const id = parseInt($(e.target).data('id'));
            const trans = this.translations.find(t => t.id === id);
            if (trans) {
                trans.translated_text = e.target.value;
                const $row = $(e.target).closest('tr');
                const isModified = this.isModified(trans);
                const isEmpty = !trans.translated_text || trans.translated_text.trim() === '';

                $row.removeClass('table-warning table-danger');
                if (isModified) $row.addClass('table-warning');
                else if (isEmpty) $row.addClass('table-danger');

                this.updateStats();
            }
        });

        this.renderPagination(totalPages);
    }

    updateStats() {
        const filtered = this.getFilteredTranslations();
        const modifiedCount = this.getModifiedCount();
        const emptyCount = this.getEmptyCount();

        $(this.wrapper).find('#te-stats').html(`
            ${__('Showing')} ${Math.min(this.pageSize, filtered.length)} ${__('of')} ${filtered.length} ${__('translations')}
            (${this.translations.length} ${__('total')})
            ${modifiedCount > 0 ? `<span class="text-warning"> | ${modifiedCount} ${__('modified')}</span>` : ''}
            ${emptyCount > 0 ? `<span class="text-danger"> | ${emptyCount} ${__('empty')}</span>` : ''}
        `);
    }

    renderPagination(totalPages) {
        if (totalPages <= 1) {
            $(this.wrapper).find('#te-pagination').html('');
            return;
        }

        let html = `
            <div class="d-flex justify-content-center align-items-center">
                <button class="btn btn-default btn-sm mr-2" id="te-prev" ${this.currentPage === 1 ? 'disabled' : ''}>
                    <i class="fa fa-chevron-left"></i> ${__('Previous')}
                </button>
                <span class="mx-3">${__('Page')} ${this.currentPage} ${__('of')} ${totalPages}</span>
                <button class="btn btn-default btn-sm ml-2" id="te-next" ${this.currentPage === totalPages ? 'disabled' : ''}>
                    ${__('Next')} <i class="fa fa-chevron-right"></i>
                </button>
            </div>
        `;

        $(this.wrapper).find('#te-pagination').html(html);

        $(this.wrapper).find('#te-prev').on('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderGrid();
            }
        });

        $(this.wrapper).find('#te-next').on('click', () => {
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderGrid();
            }
        });
    }

    async saveTranslations() {
        const modifiedCount = this.getModifiedCount();

        if (modifiedCount === 0) {
            frappe.msgprint(__('No changes to save'));
            return;
        }

        const appName = $(this.wrapper).find('#te-app-select').val();
        const langCode = $(this.wrapper).find('#te-lang-select').val();

        frappe.show_progress(__('Saving'), 0, 100, __('Saving translations...'));

        try {
            const modifiedTranslations = this.translations.filter(t => this.isModified(t));

            for (const trans of modifiedTranslations) {
                await frappe.call({
                    method: 'rustic_translator.api.translation.log_translation_change',
                    args: {
                        session_name: this.sessionName,
                        app_name: appName,
                        source_text: trans.source_text,
                        old_translation: this.originalTranslations[trans.id] || '',
                        new_translation: trans.translated_text || '',
                        context: trans.context
                    }
                });
            }

            // Debug: log first 3 translations being saved
            console.log('Saving translations. First 3:', this.translations.slice(0, 3));
            console.log('Modified translations:', modifiedTranslations.map(t => ({
                id: t.id,
                source: t.source_text.substring(0, 30),
                translated: t.translated_text
            })));

            const response = await frappe.call({
                method: 'rustic_translator.api.translation.save_translations',
                args: {
                    app_name: appName,
                    language_code: langCode,
                    translations: JSON.stringify(this.translations),
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

                frappe.hide_progress();
                const msg = response.message;
                frappe.show_alert({
                    message: `Saved ${msg.rows_written} rows (verified: ${msg.verification_count}) to ${msg.file_path}`,
                    indicator: 'green'
                });
                console.log('Save response:', msg);

                await this.createSession();
                this.renderGrid();
            } else {
                frappe.hide_progress();
                frappe.msgprint({
                    title: __('Save Failed'),
                    indicator: 'red',
                    message: JSON.stringify(response.message || response)
                });
            }
        } catch (error) {
            frappe.hide_progress();
            frappe.msgprint({
                title: __('Error'),
                indicator: 'red',
                message: __('Failed to save translations: {0}', [error.message || error])
            });
        }
    }

    discardChanges() {
        const modifiedCount = this.getModifiedCount();

        if (modifiedCount === 0) {
            frappe.msgprint(__('No changes to discard'));
            return;
        }

        frappe.confirm(
            __('Are you sure you want to discard {0} changes?', [modifiedCount]),
            () => {
                this.translations.forEach(t => {
                    t.translated_text = this.originalTranslations[t.id] || '';
                });

                frappe.show_alert({
                    message: __('Changes discarded'),
                    indicator: 'blue'
                });

                this.renderGrid();
            }
        );
    }

    showBackups() {
        const appName = $(this.wrapper).find('#te-app-select').val();
        const langCode = $(this.wrapper).find('#te-lang-select').val();

        frappe.call({
            method: 'rustic_translator.api.translation.get_backups',
            args: {
                app_name: appName,
                language_code: langCode
            },
            callback: (r) => {
                const backups = r.message || [];

                if (backups.length === 0) {
                    frappe.msgprint(__('No backups available'));
                    return;
                }

                const dialog = new frappe.ui.Dialog({
                    title: __('Restore from Backup'),
                    fields: [
                        {
                            fieldname: 'backup',
                            fieldtype: 'Select',
                            label: __('Select Backup'),
                            options: backups.map(b => b.name).join('\n'),
                            reqd: 1
                        }
                    ],
                    primary_action_label: __('Restore'),
                    primary_action: async (values) => {
                        dialog.hide();
                        await this.restoreBackup(values.backup);
                    }
                });

                dialog.show();
            }
        });
    }

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
                message: __('Failed to restore backup')
            });
        }
    }
}
