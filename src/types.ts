export interface Lv999Settings {
    taskFolder: string;
    level: number;
    currentXp: number;
    diamonds: number;
    goldCoins: number;
    silverCoins: number;
}

export const DEFAULT_SETTINGS: Lv999Settings = {
    taskFolder: 'Lv999_Tasks',
    level: 1,
    currentXp: 0,
    diamonds: 0,
    goldCoins: 0,
    silverCoins: 0
};

export interface TaskData {
    id: string; // usually filename
    name: string;
    type: 'daily' | 'weekly' | 'strategic' | 'negative';
    dueDate: string;
    repetition: string; 
    rewardXp: number;
    rewardDiamond: number;
    rewardGold: number;
    rewardSilver: number;
    completed: boolean;
    file: any; // Obsidian TFile
}