const vscode = acquireVsCodeApi();

document.getElementById('settingsForm').addEventListener('submit', event => {
    event.preventDefault();
    const timeInterval = document.getElementById('timeInterval').value;
    vscode.postMessage({
        command: 'saveSettings',
        timeInterval: timeInterval
    });
});