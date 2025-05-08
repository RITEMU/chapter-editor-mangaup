let files = [];
let worker;

// عناصر DOM
const imageInput = document.getElementById('imageInput');
const fileTree = document.getElementById('fileTree');
const outputNameInput = document.getElementById('outputName');
const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const qualityInput = document.getElementById('qualityInput');
const formatSelect = document.getElementById('formatSelect');
const processBtn = document.getElementById('processBtn');
const resetBtn = document.getElementById('resetBtn');

// هنگام آپلود تصاویر
imageInput.addEventListener('change', (e) => {
    const uploadedFiles = Array.from(e.target.files);
    files = [...files, ...uploadedFiles].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    updateFileTree();
    processBtn.disabled = files.length === 0;
});

// به‌روزرسانی پنل درختی
function updateFileTree() {
    fileTree.innerHTML = '';
    files.forEach((file, index) => {
        const div = document.createElement('div');
        div.classList.add('file-item');
        div.draggable = true;
        div.textContent = file.name;
        div.dataset.index = index;
        // رویدادهای Drag-and-Drop
        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);
        fileTree.appendChild(div);
    });
}

// مدیریت Drag-and-Drop
function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.dataset.index);
}

function handleDragOver(e) {
    e.preventDefault();
}

function handleDrop(e) {
    e.preventDefault();
    const draggedIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const targetIndex = parseInt(e.target.dataset.index);
    if (draggedIndex !== targetIndex) {
        const [draggedFile] = files.splice(draggedIndex, 1);
        files.splice(targetIndex, 0, draggedFile);
        updateFileTree();
    }
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

// دکمه شروع پردازش
processBtn.addEventListener('click', () => {
    if (files.length === 0) return;
    processBtn.disabled = true;
    startProcessing();
});

// دکمه ریست
resetBtn.addEventListener('click', () => {
    files = [];
    updateFileTree();
    imageInput.value = '';
    processBtn.disabled = true;
});

// شروع پردازش با Web Worker
function startProcessing() {
    if (worker) worker.terminate();
    worker = new Worker('worker.js');
    worker.postMessage({
        files: files,
        targetWidth: parseInt(widthInput.value),
        targetHeight: parseInt(heightInput.value),
        quality: parseInt(qualityInput.value) / 100,
        format: formatSelect.value,
        outputName: outputNameInput.value || 'manhwa_output'
    });
    worker.onmessage = (e) => {
        const { zipBlob, outputName } = e.data;
        saveAs(zipBlob, `${outputName}.zip`);
        processBtn.disabled = false;
    };
    worker.onerror = () => {
        alert('خطایی در پردازش رخ داد.');
        processBtn.disabled = false;
    };
}
