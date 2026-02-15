import * as vscode from 'vscode';

import moment from 'moment';
import * as dotenv from 'dotenv';
import * as path from 'path';

import { fetchDua } from './lib/fetchDua';
import { Dua } from './interfaces';

interface Country {
    id: number;
    name: string;
    iso2: string;
    iso3: string;
    phonecode: string;
    capital: string;
    currency: string;
    native: string;
    emoji: string;
}

interface State {
    type: string | null;
    id: number;
    name: string;
    iso2: string;
}

interface City {
    id: number;
    name: string;
}

let getDhikrStatusBarButton: vscode.StatusBarItem;
let intervalId: NodeJS.Timeout | undefined;

let timeInterval: number;
let country: string | undefined;
let state: string | undefined;
let city: string | undefined;

let prayerTimes: { [key: string]: string } | undefined;
let sunTimings: { [key: string]: string } | undefined;

let nextPrayerItem: vscode.StatusBarItem;
let provider: ExampleSidebarProvider;

let midnightRefreshTimeout: NodeJS.Timeout | undefined;
let dailyRefreshInterval: NodeJS.Timeout | undefined;

let hijriDate: string | undefined;
let currentDua: Dua | undefined;
let calculationMethod: number;
let notifyBeforeMinutes: number;
let duaLanguage: string;
let prayerNotificationTimeouts: NodeJS.Timeout[] = [];

// In-memory cache for geo data (countries/states/cities never change)
const geoCache = new Map<string, unknown>();

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    vscode.window.showErrorMessage('API Key is missing. Please set it in the .env file.');
    throw new Error('API Key is missing');
}

const calculationMethods = [
    { label: "Muslim World League",    value: 3  },
    { label: "ISNA (North America)",   value: 2  },
    { label: "Egyptian Authority",     value: 5  },
    { label: "Umm Al-Qura (Makkah)",   value: 4  },
    { label: "University of Karachi",  value: 1  },
    { label: "Gulf Region",            value: 8  },
    { label: "Kuwait",                 value: 9  },
    { label: "Qatar",                  value: 10 },
    { label: "Singapore",              value: 11 },
    { label: "Turkey (Diyanet)",       value: 13 },
    { label: "Tehran",                 value: 7  },
    { label: "Russia",                 value: 14 },
];

const notificationOptions = [
    { label: "Off",        value: 0  },
    { label: "5 minutes",  value: 5  },
    { label: "10 minutes", value: 10 },
    { label: "15 minutes", value: 15 },
    { label: "30 minutes", value: 30 },
];

const timeIntervals = [
    {
        label: "30 seconds",
        value: 30000
    },
    {
        label: "1 minute",
        value: 60000
    },
    {
        label: "2 minutes",
        value: 120000
    },
    {
        label: "3 minutes",
        value: 180000
    },
    {
        label: "5 minutes",
        value: 300000
    },
    {
        label: "10 minutes",
        value: 600000
    }
];

const showDua = (context: vscode.ExtensionContext) => {
    let dua: Dua = fetchDua(context);
    vscode.window.showInformationMessage(duaLanguage === 'translation' ? dua.translation : dua.arabic);
};

const setupInterval = (context: vscode.ExtensionContext) => {
    if (intervalId) {
        clearInterval(intervalId);
    }
    intervalId = setInterval(() => showDua(context), timeInterval);
};

function verboseMs(msValue: number) {
    const duration = moment.duration(msValue);
    const hours = duration.hours();
    const minutes = duration.minutes();
    const seconds = duration.seconds();

    return [
        hours ? `${hours} hour${hours > 1 ? 's' : ''}` : '',
        minutes ? `${minutes} minute${minutes > 1 ? 's' : ''}` : '',
        seconds ? `${seconds} second${seconds > 1 ? 's' : ''}` : ''
    ].filter(Boolean).join(' ');
}

const saveTimings = (context: vscode.ExtensionContext, timings: { [x: string]: string; }) => {
    // Define the fields for prayer times and sun timings
    const prayerFields: string[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    const sunFields: string[] = ['Sunrise', 'Sunset', 'Imsak', 'Midnight', 'Firstthird', 'Lastthird'];

    // Create objects for prayer times and sun timings
    const prayerTimes: { [key: string]: string } = {};
    const sunTimings: { [key: string]: string } = {};

    // Populate the prayer times object
    prayerFields.forEach(field => {
        if (timings[field]) {
            prayerTimes[field] = timings[field];
        }
    });

    // Populate the sun timings object
    sunFields.forEach(field => {
        if (timings[field]) {
            sunTimings[field] = timings[field];
        }
    });

    // Update the global state
    context.globalState.update("prayerTimes", prayerTimes);
    context.globalState.update("sunTimings", sunTimings);
};

function getNextPrayerTime(prayerTimes: { [key: string]: string }): string {
    const now = new Date();
    const times = Object.entries(prayerTimes).map(([prayer, time]) => {
        const [hours, minutes] = time.split(':').map(Number);
        const prayerTime = new Date();
        prayerTime.setHours(hours, minutes, 0, 0);
        return { prayer, time: prayerTime };
    });

    const upcomingPrayer = times.find(({ time }) => time > now);
    if (upcomingPrayer) {
        const diff = upcomingPrayer.time.getTime() - now.getTime();
        const minutes = Math.floor((diff / 1000 / 60) % 60);
        const hours = Math.floor((diff / 1000 / 60 / 60) % 24);
        return `${upcomingPrayer.prayer} in ${hours}h ${minutes}m`;
    }

    // If no future time found, return time till the first prayer of the next day
    const firstPrayerTime = times[0].time;
    const diff = firstPrayerTime.getTime() + 24 * 60 * 60 * 1000 - now.getTime();
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const hours = Math.floor((diff / 1000 / 60 / 60) % 24);

    const message = `${times[0].prayer} in ${hours}h ${minutes}m`;

    if (5 >= minutes) {
        vscode.window.showInformationMessage(message);
    }

    return message;
}

const geoHeaders = () => {
    const h = new Headers();
    h.append("X-CSCAPI-KEY", API_KEY!);
    return h;
};

const fetchCountries = async (): Promise<Country[]> => {
    const key = 'countries';
    if (geoCache.has(key)) { return geoCache.get(key) as Country[]; }

    const response = await fetch("https://api.countrystatecity.in/v1/countries", {
        method: 'GET', headers: geoHeaders(), redirect: 'follow'
    });
    const data = await response.json() as Country[];
    geoCache.set(key, data);
    return data;
};

const fetchStates = async (countryIso: string): Promise<State[]> => {
    const key = `states:${countryIso}`;
    if (geoCache.has(key)) { return geoCache.get(key) as State[]; }

    const response = await fetch(`https://api.countrystatecity.in/v1/countries/${countryIso}/states`, {
        method: 'GET', headers: geoHeaders(), redirect: 'follow'
    });
    const data = await response.json() as State[];
    geoCache.set(key, data);
    return data;
};

const fetchCities = async (countryIso: string, stateIso: string): Promise<City[]> => {
    const key = `cities:${countryIso}:${stateIso}`;
    if (geoCache.has(key)) { return geoCache.get(key) as City[]; }

    const response = await fetch(`https://api.countrystatecity.in/v1/countries/${countryIso}/states/${stateIso}/cities`, {
        method: 'GET', headers: geoHeaders(), redirect: 'follow'
    });
    const data = await response.json() as City[];
    geoCache.set(key, data);
    return data;
};

const fetchPrayerTimes = (country: string, state: string, city: string, context: vscode.ExtensionContext, callback: () => void) => {
    const method = context.globalState.get<number>('vsadhkar.calculationMethod', 3);
    fetch(`http://api.aladhan.com/v1/timingsByCity?country=${country}&state=${state}&city=${city}&method=${method}`)
        .then(response => response.json())
        .then((raw: unknown) => {
            const data = raw as { data: { timings: { [key: string]: string }; date: { hijri: { day: string; month: { en: string }; year: string } } } };
            saveTimings(context, data.data.timings);
            const h = data.data.date.hijri;
            hijriDate = `${h.day} ${h.month.en} ${h.year} AH`;
            context.globalState.update("hijriDate", hijriDate);
            callback();
        })
        .catch(error => {
            vscode.window.showErrorMessage(`Error fetching prayer times: ${error}`);
        });
};

const selectLocation = async (context: vscode.ExtensionContext) => {
    try {
        // Select Country
        const countries = await fetchCountries();
        const countryItems = countries.map(country => ({ label: country.name, description: country.iso2 }));
        const selectedCountry = await vscode.window.showQuickPick(countryItems, { placeHolder: 'Select a country' });
        if (!selectedCountry) { return; }

        // Select State
        const states = await fetchStates(selectedCountry.description!);
        const stateItems = states.map(state => ({ label: state.name, description: state.iso2, type: state.type }));
        const selectedState = await vscode.window.showQuickPick(stateItems, { placeHolder: `Select a state in ${selectedCountry.label}` });
        if (!selectedState) { return; }

        let cityLabel: string | undefined;

        // Fetch cities only if state type is not null
        if (selectedState.type !== null) {
            const cities = await fetchCities(selectedCountry.description!, selectedState.description!);
            if (cities.length > 0) {
                const cityItems = cities.map(city => ({ label: city.name }));
                const selectedCity = await vscode.window.showQuickPick(cityItems, { placeHolder: `Select a city in ${selectedState.label}, ${selectedCountry.label}` });
                if (!selectedCity) { return; }
                cityLabel = selectedCity.label;
            }
        }

        // If no city is selected, use the state as the city label
        if (!cityLabel) {
            cityLabel = selectedState.label;
        }

        // Save selected location to global state
        vscode.window.showInformationMessage(`Selected Location: ${cityLabel}, ${selectedState.label}, ${selectedCountry.label}`);
        context.globalState.update("country", selectedCountry.label);
        context.globalState.update("state", selectedState.label);
        context.globalState.update("city", cityLabel);

        fetchPrayerTimes(selectedCountry.label, selectedState.label, cityLabel, context, () => {
            setupAfterLocation(context);
            if (provider) { provider.updateWebview(); }
        });
    } catch (error) {
        vscode.window.showErrorMessage(`Error fetching location data: ${error}`);
    }
};

const updateLocationAndPrayerTimes = (context: vscode.ExtensionContext) => {
    timeInterval        = context.globalState.get('vsadhkar.timeInterval', 30000);
    calculationMethod   = context.globalState.get('vsadhkar.calculationMethod', 3);
    notifyBeforeMinutes = context.globalState.get('vsadhkar.notifyBefore', 0);
    country    = context.globalState.get("country");
    state      = context.globalState.get("state");
    city       = context.globalState.get("city");
    prayerTimes = context.globalState.get("prayerTimes");
    hijriDate   = context.globalState.get("hijriDate");
    if (prayerTimes !== undefined && nextPrayerItem) {
        nextPrayerItem.text = `Next prayer: ${getNextPrayerTime(prayerTimes)}`;
    }
};

function schedulePrayerNotifications(prayerTimesObj: { [key: string]: string }) {
    prayerNotificationTimeouts.forEach(t => clearTimeout(t));
    prayerNotificationTimeouts = [];
    if (notifyBeforeMinutes === 0) { return; }

    const now = new Date();
    Object.entries(prayerTimesObj).forEach(([prayer, timeStr]) => {
        const [h, m] = timeStr.split(':').map(Number);
        const prayerTime = new Date();
        prayerTime.setHours(h, m, 0, 0);
        const notifyAt = new Date(prayerTime.getTime() - notifyBeforeMinutes * 60 * 1000);
        const delay = notifyAt.getTime() - now.getTime();
        if (delay > 0) {
            prayerNotificationTimeouts.push(setTimeout(() => {
                vscode.window.showInformationMessage(
                    `🕌 ${prayer} prayer in ${notifyBeforeMinutes} minute${notifyBeforeMinutes !== 1 ? 's' : ''}`
                );
            }, delay));
        }
    });
}

function setupAfterLocation(context: vscode.ExtensionContext) {
    prayerTimes  = context.globalState.get("prayerTimes");
    hijriDate    = context.globalState.get("hijriDate");
    if (prayerTimes === undefined) { return; }

    if (!nextPrayerItem) {
        nextPrayerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        nextPrayerItem.command = 'vsadhkar.openSettings';
        nextPrayerItem.tooltip = 'Click to open VSAdhkar';
        context.subscriptions.push(nextPrayerItem);
        nextPrayerItem.show();
    }
    nextPrayerItem.text = `Next prayer: ${getNextPrayerTime(prayerTimes)}`;

    schedulePrayerNotifications(prayerTimes);
    scheduleMidnightRefresh(context);
    setupInterval(context);
}

function scheduleMidnightRefresh(context: vscode.ExtensionContext) {
    if (midnightRefreshTimeout) { clearTimeout(midnightRefreshTimeout); }
    if (dailyRefreshInterval)   { clearInterval(dailyRefreshInterval); }

    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const msUntilMidnight = nextMidnight.getTime() - now.getTime();

    const refresh = () => {
        const c  = context.globalState.get<string>("country");
        const s  = context.globalState.get<string>("state");
        const ci = context.globalState.get<string>("city");
        if (c && s && ci) {
            fetchPrayerTimes(c, s, ci, context, () => {
                setupAfterLocation(context);
                if (provider) { provider.updateWebview(); }
            });
        }
    };

    midnightRefreshTimeout = setTimeout(() => {
        refresh();
        dailyRefreshInterval = setInterval(refresh, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
}

async function autoDetectLocation(context: vscode.ExtensionContext) {
    try {
        const response = await fetch("https://ipapi.co/json/");
        if (!response.ok) { throw new Error(`HTTP ${response.status}`); }
        const data = await response.json() as { city?: string; region?: string; country_name?: string; };

        const detectedCity    = data.city         ?? "";
        const detectedRegion  = data.region       ?? "";
        const detectedCountry = data.country_name ?? "";
        if (!detectedCity || !detectedRegion || !detectedCountry) {
            throw new Error("Incomplete location data");
        }

        const choice = await vscode.window.showInformationMessage(
            `Detected location: ${detectedCity}, ${detectedRegion}, ${detectedCountry}. Use this?`,
            "Yes", "Choose Manually"
        );

        if (choice === "Yes") {
            await context.globalState.update("country", detectedCountry);
            await context.globalState.update("state",   detectedRegion);
            await context.globalState.update("city",    detectedCity);
            country = detectedCountry;
            state   = detectedRegion;
            city    = detectedCity;
            fetchPrayerTimes(detectedCountry, detectedRegion, detectedCity, context, () => {
                setupAfterLocation(context);
                if (provider) { provider.updateWebview(); }
            });
        } else {
            await selectLocation(context);
        }
    } catch {
        vscode.window.showWarningMessage("Could not auto-detect location. Please select manually.");
        await selectLocation(context);
    }
}

export function activate(context: vscode.ExtensionContext) {

    // ── Status bar: Dhikr button ─────────────────────────────────────────
    getDhikrStatusBarButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    getDhikrStatusBarButton.command = 'vsadhkar.getDhikr';
    getDhikrStatusBarButton.text    = `$(heart) Get Dhikr`;
    getDhikrStatusBarButton.tooltip = "Click to Get a Dhikr";
    context.subscriptions.push(getDhikrStatusBarButton);
    getDhikrStatusBarButton.show();

    vscode.window.showInformationMessage("Free Palestine !");
    timeInterval        = context.globalState.get('vsadhkar.timeInterval', 30000);
    calculationMethod   = context.globalState.get('vsadhkar.calculationMethod', 3);
    notifyBeforeMinutes = context.globalState.get('vsadhkar.notifyBefore', 0);
    duaLanguage         = context.globalState.get('vsadhkar.duaLanguage', 'arabic');
    hijriDate           = context.globalState.get("hijriDate");

    // ── Commands ─────────────────────────────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('vsadhkar.getDhikr', () => showDua(context))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('vsadhkar.openSettings', () => {
            vscode.commands.executeCommand('workbench.view.vsadhkar.exampleSidebar');
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('vsadhkar.selectLocation', () => selectLocation(context))
    );

    // ── Debug: clear all extension data ──────────────────────────────────
    context.subscriptions.push(
        vscode.commands.registerCommand('vsadhkar.clearData', async () => {
            await context.globalState.update("country",      undefined);
            await context.globalState.update("state",        undefined);
            await context.globalState.update("city",         undefined);
            await context.globalState.update("prayerTimes",  undefined);
            await context.globalState.update("sunTimings",   undefined);
            vscode.window.showInformationMessage("VSAdhkar: extension data cleared. Reload window to test first-run flow.");
        })
    );

    // ── Sidebar provider ─────────────────────────────────────────────────
    provider = new ExampleSidebarProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ExampleSidebarProvider.viewType, provider)
    );

    // ── Initial dua ───────────────────────────────────────────────────────
    currentDua = fetchDua(context);

    // ── Minute-tick: keeps status bar label current ───────────────────────
    setInterval(() => updateLocationAndPrayerTimes(context), 60000);

    // ── Location / prayer times bootstrap ────────────────────────────────
    country     = context.globalState.get("country");
    state       = context.globalState.get("state");
    city        = context.globalState.get("city");
    prayerTimes = context.globalState.get("prayerTimes");

    const isFirstRun = !country || !state || !city || !prayerTimes;

    if (isFirstRun) {
        autoDetectLocation(context);
    } else {
        // Show cached times immediately, then refresh in background
        setupAfterLocation(context);
        fetchPrayerTimes(country!, state!, city!, context, () => {
            setupAfterLocation(context);
            provider.updateWebview();
        });
    }
}

class ExampleSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vsadhkar.exampleWebview';
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) { }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set initial HTML content with fresh data from globalState
        updateLocationAndPrayerTimes(this._context);
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        // Refresh webview whenever it becomes visible (e.g. after QuickPick closes)
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this.updateWebview();
            }
        });

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'saveSettings': {
                    var t = parseInt(message.t);
                    timeInterval = t;
                    this._context.globalState.update("vsadhkar.timeInterval", t);
                    vscode.window.showInformationMessage(`Settings saved: Show Dua every ${verboseMs(t)}`);
                    setupInterval(this._context);
                    provider.updateWebview();
                    break;
                }
                case 'selectLocation':
                    vscode.commands.executeCommand('vsadhkar.selectLocation');
                    break;
                case 'refreshDua':
                    currentDua = fetchDua(this._context);
                    provider.updateWebview();
                    break;
                case 'saveNotifyBefore': {
                    notifyBeforeMinutes = parseInt(message.value, 10);
                    this._context.globalState.update('vsadhkar.notifyBefore', notifyBeforeMinutes);
                    if (prayerTimes) { schedulePrayerNotifications(prayerTimes); }
                    break;
                }
                case 'saveMethod': {
                    calculationMethod = parseInt(message.value, 10);
                    this._context.globalState.update('vsadhkar.calculationMethod', calculationMethod);
                    const c = this._context.globalState.get<string>("country");
                    const s = this._context.globalState.get<string>("state");
                    const ci = this._context.globalState.get<string>("city");
                    if (c && s && ci) {
                        fetchPrayerTimes(c, s, ci, this._context, () => {
                            setupAfterLocation(this._context);
                            provider.updateWebview();
                        });
                    }
                    break;
                }
                case 'saveDuaLanguage': {
                    duaLanguage = message.value;
                    this._context.globalState.update('vsadhkar.duaLanguage', duaLanguage);
                    provider.updateWebview();
                    break;
                }
            }
        });
    }

    public updateWebview() {
        if (this._view) {
            updateLocationAndPrayerTimes(this._context);
            timeInterval = this._context.globalState.get('vsadhkar.timeInterval', 30000);
            this._view.webview.html = this.getHtmlForWebview(this._view.webview);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const vscodeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const palestineFlag = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'palestine.png'));
        const prayerTimes: { [key: string]: string } | undefined = this._context.globalState.get("prayerTimes");
        const hasLocation = country !== undefined && state !== undefined && city !== undefined && prayerTimes !== undefined;

        const locationSection = hasLocation ? `
            <div class="section">
                <div class="section-label">Location</div>
                <div class="location-row">
                    <div class="location-info">
                        <div class="location-city">${city}</div>
                        <div class="location-region">${state}, ${country}</div>
                    </div>
                    <button class="btn-change" id="selectLocationButton">Change</button>
                </div>
            </div>

            <div class="section">
                <div class="section-label">Prayer Times</div>
                <div class="prayer-list" id="prayerList">
                    ${Object.entries(prayerTimes!).map(([name, time]) => `
                    <div class="prayer-row" data-time="${time}">
                        <span class="prayer-row-name">${name}</span>
                        <span class="prayer-row-time">${time}</span>
                    </div>`).join('')}
                </div>
            </div>

            ${currentDua ? `
            <div class="section">
                <div class="section-label dua-header">
                    <span>Dua</span>
                    <button class="btn-refresh" id="refreshDuaButton">↺</button>
                </div>
                ${duaLanguage === 'translation'
                    ? `<div class="dua-translation">${currentDua.translation}</div>`
                    : `<div class="dua-arabic">${currentDua.arabic}</div>
                <div class="dua-transliteration">${currentDua.transliteration}</div>`
                }
            </div>` : ''}

            <div class="section">
                <div class="section-label">Settings</div>
                <div class="settings-rows">
                    <div class="setting-row">
                        <span class="setting-desc">Show dua every</span>
                        <select id="timeIntervalSelector">
                            ${timeIntervals.map(t => `<option value="${t.value}" ${timeInterval === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="setting-row">
                        <span class="setting-desc">Notify before</span>
                        <select id="notifyBeforeSelector">
                            ${notificationOptions.map(o => `<option value="${o.value}" ${notifyBeforeMinutes === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="setting-row">
                        <span class="setting-desc">Method</span>
                        <select id="methodSelector">
                            ${calculationMethods.map(m => `<option value="${m.value}" ${calculationMethod === m.value ? 'selected' : ''}>${m.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="setting-row">
                        <span class="setting-desc">Dua language</span>
                        <select id="duaLanguageSelector">
                            <option value="arabic" ${duaLanguage === 'arabic' ? 'selected' : ''}>Arabic</option>
                            <option value="translation" ${duaLanguage === 'translation' ? 'selected' : ''}>Translation</option>
                        </select>
                    </div>
                </div>
            </div>` : `
            <div class="section">
                <div class="empty-state">
                    <span class="empty-icon">📍</span>
                    <div class="empty-title">No location set</div>
                    <div class="empty-sub">Select your location to see prayer times</div>
                    <button class="btn-primary" id="selectLocationButton">Select Location</button>
                </div>
            </div>`;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <link href="${vscodeStyleUri}" rel="stylesheet">
            <title>VSAdhkar</title>
        </head>
        <body>
            <div class="app-header">
                <span class="app-name">☪️ VSAdhkar</span>
                ${hijriDate ? `<span class="hijri-date">${hijriDate}</span>` : ''}
            </div>

            ${locationSection}

            <div class="section github-section">
                <div class="github-message">Open source & free forever</div>
                <a href="https://github.com/azizbecha/vsadhkar" class="github-link">View on GitHub →</a>
            </div>

            <div class="section palestine-section">
                <img src="${palestineFlag}" class="flag-img" />
                <span class="palestine-label">🍉 Free Palestine</span>
                <a href="https://www.gofundme.com/f/42fd8k-stand-with-gaza-provide-lifeline-to-families" class="btn-donate">Donate</a>
            </div>

            <script>
                const vscode = acquireVsCodeApi();

                // Mark past prayers and highlight the next upcoming one
                (function markPrayerRows() {
                    const rows = document.querySelectorAll('.prayer-row');
                    if (!rows.length) { return; }
                    const now = new Date();
                    let nextFound = false;
                    for (const row of rows) {
                        const timeStr = row.getAttribute('data-time');
                        if (!timeStr) { continue; }
                        const [h, m] = timeStr.split(':').map(Number);
                        const t = new Date();
                        t.setHours(h, m, 0, 0);
                        if (!nextFound && t > now) {
                            nextFound = true;
                            row.classList.add('next');
                            const badge = document.createElement('span');
                            badge.className = 'next-badge';
                            badge.textContent = 'Next';
                            row.querySelector('.prayer-row-name').after(badge);
                        } else if (t <= now) {
                            row.classList.add('past');
                        }
                    }
                    // All prayers passed — wrap around to first (next day)
                    if (!nextFound && rows.length) {
                        const first = rows[0];
                        first.classList.remove('past');
                        first.classList.add('next');
                        const badge = document.createElement('span');
                        badge.className = 'next-badge';
                        badge.textContent = 'Next';
                        first.querySelector('.prayer-row-name').after(badge);
                    }
                })();

                const sel = document.getElementById('timeIntervalSelector');
                if (sel) {
                    sel.addEventListener('change', e => {
                        vscode.postMessage({ command: 'saveSettings', t: e.target.value });
                    });
                }

                const notifySel = document.getElementById('notifyBeforeSelector');
                if (notifySel) {
                    notifySel.addEventListener('change', e => {
                        vscode.postMessage({ command: 'saveNotifyBefore', value: e.target.value });
                    });
                }

                const methodSel = document.getElementById('methodSelector');
                if (methodSel) {
                    methodSel.addEventListener('change', e => {
                        vscode.postMessage({ command: 'saveMethod', value: e.target.value });
                    });
                }

                const duaLangSel = document.getElementById('duaLanguageSelector');
                if (duaLangSel) {
                    duaLangSel.addEventListener('change', e => {
                        vscode.postMessage({ command: 'saveDuaLanguage', value: e.target.value });
                    });
                }

                document.getElementById('selectLocationButton')?.addEventListener('click', () => {
                    vscode.postMessage({ command: 'selectLocation' });
                });

                document.getElementById('refreshDuaButton')?.addEventListener('click', () => {
                    vscode.postMessage({ command: 'refreshDua' });
                });
            </script>
        </body>
        </html>`;
    }
}

export function deactivate() {
    if (intervalId)             { clearInterval(intervalId); }
    if (midnightRefreshTimeout) { clearTimeout(midnightRefreshTimeout); }
    if (dailyRefreshInterval)   { clearInterval(dailyRefreshInterval); }
    prayerNotificationTimeouts.forEach(t => clearTimeout(t));
}