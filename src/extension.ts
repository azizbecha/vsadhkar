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

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
    vscode.window.showErrorMessage('API Key is missing. Please set it in the .env file.');
    throw new Error('API Key is missing');
}

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
    vscode.window.showInformationMessage(dua.arabic);
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

const fetchCountries = async (): Promise<Country[]> => {
    const headers = new Headers();
    headers.append("X-CSCAPI-KEY", API_KEY);

    const response = await fetch("https://api.countrystatecity.in/v1/countries", {
        method: 'GET',
        headers: headers,
        redirect: 'follow'
    });
    return response.json() as Promise<Country[]>;
};

const fetchStates = async (countryIso: string): Promise<State[]> => {
    const headers = new Headers();
    headers.append("X-CSCAPI-KEY", API_KEY);

    const response = await fetch(`https://api.countrystatecity.in/v1/countries/${countryIso}/states`, {
        method: 'GET',
        headers: headers,
        redirect: 'follow'
    });
    return response.json() as Promise<State[]>;
};

const fetchCities = async (countryIso: string, stateIso: string): Promise<City[]> => {
    const headers = new Headers();
    headers.append("X-CSCAPI-KEY", API_KEY);

    const response = await fetch(`https://api.countrystatecity.in/v1/countries/${countryIso}/states/${stateIso}/cities`, {
        method: 'GET',
        headers: headers,
        redirect: 'follow'
    });
    return response.json() as Promise<City[]>;
};

const fetchPrayerTimes = (country: string, state: string, city: string, context: vscode.ExtensionContext, callback: () => void) => {
    fetch(`http://api.aladhan.com/v1/timingsByCity?country=${country}&state=${state}&city=${city}`)
        .then(response => response.json())
        .then((data: any) => {
            const timings = data.data.timings;
            saveTimings(context, timings);
            callback(); // Call the callback to update the webview
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
    timeInterval = context.globalState.get('vsadhkar.timeInterval', 30000);
    country = context.globalState.get("country");
    state = context.globalState.get("state");
    city = context.globalState.get("city");
    prayerTimes = context.globalState.get("prayerTimes");
    if (prayerTimes !== undefined && nextPrayerItem) {
        nextPrayerItem.text = `Next prayer: ${getNextPrayerTime(prayerTimes)}`;
    }
};

function setupAfterLocation(context: vscode.ExtensionContext) {
    prayerTimes = context.globalState.get("prayerTimes");
    if (prayerTimes === undefined) { return; }

    if (!nextPrayerItem) {
        nextPrayerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        context.subscriptions.push(nextPrayerItem);
        nextPrayerItem.show();
    }
    nextPrayerItem.text = `Next prayer: ${getNextPrayerTime(prayerTimes)}`;

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
    timeInterval = context.globalState.get('vsadhkar.timeInterval', 30000);

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

            <div class="section">
                <div class="section-label">Dua Reminder</div>
                <div class="setting-row">
                    <span class="setting-desc">Show every</span>
                    <select id="timeIntervalSelector">
                        ${timeIntervals.map(t => `<option value="${t.value}" ${timeInterval === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
                    </select>
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

                document.getElementById('selectLocationButton')?.addEventListener('click', () => {
                    vscode.postMessage({ command: 'selectLocation' });
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
}