export interface Lv999Settings {
    taskFolder: string;
    level: number;
    currentXp: number;
    diamonds: number;
    goldCoins: number;
    silverCoins: number;
    inventory: Record<string, number>;
}

export const DEFAULT_SETTINGS: Lv999Settings = {
    taskFolder: 'Lv999_Tasks',
    level: 1,           // was missing — caused XP formula to use undefined
    currentXp: 0,
    diamonds: 0,
    goldCoins: 0,
    silverCoins: 0,
    inventory: {}
};

export interface TaskData {
    id: string;
    name: string;
    type: 'daily' | 'weekly' | 'strategic' | 'negative' | 'general';
    dueDate: string;        // YYYY-MM-DD local date string
    repetition: string;     // 'none' | 'daily' | 'weekly-mon' … 'weekly-sun'
    rewardXp: number;
    rewardDiamond: number;
    rewardGold: number;
    rewardSilver: number;
    completed: boolean;     // only meaningful for repetition === 'none'
    file: any;
}