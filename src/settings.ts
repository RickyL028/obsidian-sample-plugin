import { App, PluginSettingTab, Setting } from 'obsidian';
import Lv999Plugin from './main';

export class Lv999SettingTab extends PluginSettingTab {
    plugin: Lv999Plugin;

    constructor(app: App, plugin: Lv999Plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Lv999 Plugin Settings' });

        new Setting(containerEl)
            .setName('Designated Task Folder')
            .setDesc('Folder where all Lv999 tasks will be stored as .md files.')
            .addText(text => text
                .setPlaceholder('Lv999_Tasks')
                .setValue(this.plugin.settings.taskFolder)
                .onChange(async (value) => {
                    this.plugin.settings.taskFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Gemini API Key')
            .setDesc('Required for evaluating quest rewards with AI (using gemma-4-31b-it).')
            .addText(text => {
                text.inputEl.type = 'password';
                text.setPlaceholder('AIzaSy...')
                    .setValue(this.plugin.settings.geminiApiKey)
                    .onChange(async (value) => {
                        this.plugin.settings.geminiApiKey = value.trim();
                        await this.plugin.saveSettings();
                    });
            });
    }
}