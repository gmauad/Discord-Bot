import os
import ctypes
import numpy as np
from scipy import signal
from flask import Flask, request, jsonify
from faster_whisper import WhisperModel

# =====================================================================
# GPU ACCELERATION INJECTION (CUDA)
# Modifique os diretórios abaixo de acordo com a instalação do seu NVIDIA Toolkit.
# =====================================================================
cublas_path = r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\bin\cublas64_12.dll"
if os.path.exists(cublas_path):
    try:
        ctypes.CDLL(cublas_path)
    except Exception as e:
        pass
caminho_cuda = r"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.1\bin"
if os.name == 'nt' and os.path.exists(caminho_cuda):
    os.add_dll_directory(caminho_cuda)
# =====================================================================

app = Flask(__name__)

print("[SISTEMA] Inicializando inferência Faster-Whisper...")
try:
    modelo_stt = WhisperModel("medium", device="cuda", compute_type="float16")
    print("[SISTEMA] STT API ONLINE (GPU Ativada) na porta 4000")
except Exception as e:
    print(f"[AVISO] Fallback para CPU: {e}")
    modelo_stt = WhisperModel("medium", device="cpu", compute_type="float32")

@app.route('/transcrever', methods=['POST'])
def transcrever_audio():
    if 'audio' not in request.files:
        return jsonify({"erro": "Nenhum fluxo de áudio enviado"}), 400
    try:
        raw_data = request.files['audio'].read()
        if not raw_data: return jsonify({"erro": "Fluxo de áudio vazio"}), 400
        
        # Converte Buffer PCM bruto para Float32 (formato nativo ML)
        audio_int16 = np.frombuffer(raw_data, dtype=np.int16)
        audio_stereo = audio_int16.reshape(-1, 2)
        audio_mono = audio_stereo.mean(axis=1)
        
        # Filtro de decimação Anti-Aliasing (Downsample 48kHz -> 16kHz)
        audio_16k = signal.decimate(audio_mono, 3)
        audio_float32 = audio_16k.astype(np.float32) / 32768.0
        
        segments, info = modelo_stt.transcribe(
            audio_float32, language="pt", beam_size=5,
            vad_filter=True, vad_parameters=dict(min_silence_duration_ms=500)
        )
        texto = "".join([segment.text for segment in segments]).strip()
        
        if texto: print(f"[TRANSCRIÇÃO]: {texto}")
        return jsonify({"texto": texto})
    except Exception as e:
        return jsonify({"erro": str(e)}), 500

if __name__ == '__main__':
    app.run(port=4000)