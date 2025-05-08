function log(message) {
    const logPanel = document.getElementById('log');
    const now = new Date().toLocaleTimeString('fa-IR');
    logPanel.innerHTML += `[${now}] ${message}<br>`;
    logPanel.scrollTop = logPanel.scrollHeight;
}

function updateProgress(percent) {
    const progress = document.getElementById('progress');
    const progressText = document.getElementById('progressText');
    progress.style.width = `${percent}%`;
    progressText.textContent = `${Math.round(percent)}%`;
}

function resetUI() {
    document.getElementById('imageInput').value = '';
    document.getElementById('outputName').value = 'manhwa_output';
    document.getElementById('widthInput').value = 800;
    document.getElementById('heightInput').value = 12000;
    document.getElementById('qualityInput').value = 95;
    document.getElementById('formatSelect').value = 'webp';
    document.getElementById('fileTree').innerHTML = '';
    document.getElementById('log').innerHTML = '';
    updateProgress(0);
}

function buildFileTree(files) {
    const fileTree = document.getElementById('fileTree');
    fileTree.innerHTML = '';
    files.forEach((file, index) => {
        const li = document.createElement('li');
        li.textContent = file.name;
        li.setAttribute('draggable', 'true');
        li.setAttribute('data-index', index);
        li.addEventListener('dragstart', handleDragStart);
        li.addEventListener('dragover', handleDragOver);
        li.addEventListener('drop', handleDrop);
        fileTree.appendChild(li);
    });
}

function handleDragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.getAttribute('data-index'));
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const targetIndex = parseInt(e.target.getAttribute('data-index'));
    if (draggedIndex !== targetIndex) {
        const files = Array.from(document.getElementById('imageInput').files);
        const draggedFile = files[draggedIndex];
        files.splice(draggedIndex, 1);
        files.splice(targetIndex, 0, draggedFile);
        buildFileTree(files);
        // Update the file input with reordered files
        const dataTransfer = new DataTransfer();
        files.forEach(file => dataTransfer.items.add(file));
        document.getElementById('imageInput').files = dataTransfer.files;
    }
}
