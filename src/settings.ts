import {App, PluginSettingTab, Setting} from 'obsidian';
import Nova from './main';

export interface NovaSettings {
	mySetting: string;
	wrongQuestionsFolder: string;
}

export const DEFAULT_SETTINGS: NovaSettings = {
	mySetting: 'default',
	wrongQuestionsFolder: 'past',
};

export class SampleSettingTab extends PluginSettingTab {
	plugin: Nova;

	constructor(app: App, plugin: Nova) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'Nova Plugin Settings'});


		new Setting(containerEl)
			.setName('"Got Wrong" questions folder')
			.setDesc('Vault-relative folder where imported question notes will be saved. The folder is created automatically if it does not exist.')
			.addText(text => text
				.setPlaceholder('Got Wrong')
				.setValue(this.plugin.settings.wrongQuestionsFolder)
				.onChange(async (value) => {
					this.plugin.settings.wrongQuestionsFolder = value.trim() || 'Got Wrong';
					await this.plugin.saveSettings();
				}));
	}
}