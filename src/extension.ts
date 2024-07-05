import * as vscode from 'vscode';
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
    id: number;
    name: string;
}

interface City {
    id: number;
    name: string;
}

let getDhikrStatusBarButton: vscode.StatusBarItem;
let intervalId: NodeJS.Timeout;

let timeInterval: number;
let city: string | undefined;
let country: string | undefined;
let prayerTimes: { [key: string]: string } | undefined;
let sunTimings: { [key: string]: string } | undefined;

const showDua = (context: vscode.ExtensionContext) => {
    let dua: Dua = fetchDua(context);
    vscode.window.showInformationMessage(dua.arabic);
};

const setupInterval = (context: vscode.ExtensionContext) => {
    clearInterval(intervalId);
    intervalId = setInterval(() => showDua(context), timeInterval);
};

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

export function activate(context: vscode.ExtensionContext) {
    // Status Bar Buttons
    getDhikrStatusBarButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    getDhikrStatusBarButton.command = 'vsadhkar.getDhikr';
    getDhikrStatusBarButton.text = `$(heart) Get Dhikr`;
    getDhikrStatusBarButton.tooltip = "Click to Get a Dhikr";
    context.subscriptions.push(getDhikrStatusBarButton);
    getDhikrStatusBarButton.show();

    vscode.window.showInformationMessage("Free Palestine !");

    // Retrieve saved time interval or use default (30s)
    timeInterval = context.globalState.get('vsadhkar.timeInterval', 30000);

    city = context.globalState.get("city");
    country = context.globalState.get("country");
    prayerTimes = context.globalState.get("prayerTimes");

    const currentTime = new Date();
    console.log('Current time:', currentTime.toString());

    if (city === undefined && country === undefined && prayerTimes === undefined) {
        console.log("ma3ana chay defined");
        fetch("https://api.ipregistry.co/?key=jzx565sn5orzxnu5")
            .then(response => response.json())
            .then((data: any) => {
                console.log(data.location.country.name);
                console.log(data.location.city);

                context.globalState.update("country", data.location.country.name);
                context.globalState.update("city", data.location.city);
                // get prayer tims based on my country and city
                fetch(`http://api.aladhan.com/v1/timingsByCity/:date?city=${data.location.city}&country=${data.location.country.name}`)
                    .then(response => response.json())
                    .then((data: any) => {
                        const timings = data.data.timings;
                        console.log(timings);
                        saveTimings(context, timings);
                    });
            });
    } else {
        fetch(`http://api.aladhan.com/v1/timingsByCity/:date?city=${city}&country=${country}`)
            .then(response => response.json())
            .then((data: any) => {
                const timings = data.data.timings;
                saveTimings(context, timings);
            });
    }

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

    if (prayerTimes === undefined) { return; }

    const nextPrayerItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    nextPrayerItem.text = `Next prayer: ${getNextPrayerTime(prayerTimes)}`;
    nextPrayerItem.show();

    setInterval(() => {
        if (prayerTimes !== undefined) {
            nextPrayerItem.text = `Next prayer: ${getNextPrayerTime(prayerTimes)}`;
        }
    }, 60000); // Update every minute

    context.subscriptions.push(nextPrayerItem);

    setupInterval(context);

    const disposable = vscode.commands.registerCommand('vsadhkar.getDhikr', () => {
        showDua(context);
    });

    context.subscriptions.push(disposable);

    const provider = new ExampleSidebarProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ExampleSidebarProvider.viewType, provider)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('vsadhkar.openSettings', () => {
            vscode.commands.executeCommand('workbench.view.vsadhkar.exampleSidebar');
        })
    );
}

class ExampleSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'vsadhkar.exampleWebview';

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) { }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set initial HTML content
        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'saveSettings':
                    timeInterval = parseInt(message.timeInterval);
                    this._context.workspaceState.update('vsadhkar.timeInterval', timeInterval);
                    vscode.window.showInformationMessage(`Settings saved: Show Dua every ${timeInterval / 1000} seconds`);
                    setupInterval(this._context);
                    // Reload the webview content
                    webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
                    break;
            }
        });
    }

    private getHtmlForWebview(webview: vscode.Webview): string {
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css'));
        const vscodeStyleUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'script.js'));
        const palestineFlag = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'palestine.png'));
        const prayerTimes: { [key: string]: string } | undefined = this._context.globalState.get("prayerTimes");

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link href="${styleUri}" rel="stylesheet">
            <link href="${vscodeStyleUri}" rel="stylesheet">
            <script src="${scriptUri}"></script>
            <title>VSAdhkar Settings</title>
        </head>
        <body>
            <h1>VSAdhkar Settings</h1>
            <h3>Free Palestine !</h3>
            <img src="${palestineFlag}" />
            
            <a href="https://www.gofundme.com/f/CareForGaza">
                <button>
                    Donate
                </button>
            </a>
            <hr />
            <h3>Prayer times for ${city}, ${country}</h3>
            <div id="prayerTimesContainer">
                ${prayerTimes && Object.keys(prayerTimes).map(prayer => `<div class="prayer-time">${prayer}: ${prayerTimes[prayer]}</div>`).join('')}
            </div>
            <form id="settingsForm">
                <p>Show Dua every</p>
                <select id="timeInterval">
                    <option value="30000" ${timeInterval === 30000 ? 'selected' : ''}>30s (recommended)</option>
                    <option value="60000" ${timeInterval === 60000 ? 'selected' : ''}>1 min</option>
                    <option value="120000" ${timeInterval === 120000 ? 'selected' : ''}>2 min</option>
                    <option value="180000" ${timeInterval === 180000 ? 'selected' : ''}>3 min</option>
                    <option value="300000" ${timeInterval === 300000 ? 'selected' : ''}>5 min</option>
                    <option value="600000" ${timeInterval === 600000 ? 'selected' : ''}>10 min</option>
                </select>
                <button type="submit">Save</button>
            </form>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                document.getElementById('settingsForm').addEventListener('submit', event => {
                    event.preventDefault();
                    const timeInterval = document.getElementById('timeInterval').value;
                    vscode.postMessage({
                        command: 'saveSettings',
                        timeInterval: timeInterval
                    });
                });
            </script>
        </body>
        </html>`;
    }
}

export function deactivate() { }
