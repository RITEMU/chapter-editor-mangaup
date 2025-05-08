self.onmessage = async (e) => {
    const { files, targetWidth, targetHeight, quality, format, outputName } = e.data;
    const zip = new JSZip();
    let remainingCanvas = null;
    let outputIndex = 1;

    for (let i = 0; i < files.length; i++) {
        let img = await loadImage(files[i]);
        img = resizeImage(img, targetWidth);

        if (remainingCanvas) {
            img = combineImages(remainingCanvas, img);
            remainingCanvas = null;
        }

        while (img.height > targetHeight) {
            const cropped = cropImage(img, 0, 0, img.width, targetHeight);
            const outputData = canvasToDataUrl(cropped, format, quality);
            zip.file(`${String(outputIndex).padStart(3, '0')}.${format}`, outputData.split(',')[1], { base64: true });
            outputIndex++;
            const remainingHeight = img.height - targetHeight;
            remainingCanvas = cropImage(img, 0, targetHeight, img.width, remainingHeight);
            img = remainingCanvas;
        }

        if (i === files.length - 1 && img.height > 0) {
            const outputData = canvasToDataUrl(img, format, quality);
            zip.file(`${String(outputIndex).padStart(3, '0')}.${format}`, outputData.split(',')[1], { base64: true });
        } else if (img.height > 0) {
            remainingCanvas = img;
        }
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    self.postMessage({ zipBlob, outputName });
};

async function loadImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = new OffscreenCanvas(img.width, img.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
        };
    });
}

function resizeImage(canvas, targetWidth) {
    if (canvas.width === targetWidth) return canvas;
    const ratio = targetWidth / canvas.width;
    const newHeight = Math.round(canvas.height * ratio);
    const newCanvas = new OffscreenCanvas(targetWidth, newHeight);
    const ctx = newCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, 0, targetWidth, newHeight);
    return newCanvas;
}

function combineImages(topCanvas, bottomCanvas) {
    const newCanvas = new OffscreenCanvas(bottomCanvas.width, topCanvas.height + bottomCanvas.height);
    const ctx = newCanvas.getContext('2d');
    ctx.drawImage(topCanvas, 0, 0);
    ctx.drawImage(bottomCanvas, 0, topCanvas.height);
    return newCanvas;
}

function cropImage(canvas, x, y, width, height) {
    const newCanvas = new OffscreenCanvas(width, height);
    const ctx = newCanvas.getContext('2d');
    ctx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
    return newCanvas;
}

function canvasToDataUrl(canvas, format, quality) {
    return canvas.convertToBlob({ type: `image/${format}`, quality }).then(blob => {
        return new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    });
}
