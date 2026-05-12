import { useEffect, useState, useCallback } from 'react';
import { FolderOpen, Upload, Trash2, File, Folder, Package, Loader2 } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../hooks/useToast';

interface FileItem {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
}

interface Props {
  deviceId: string;
  tailscaleIp: string;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FileTransfer({ deviceId, tailscaleIp }: Props) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [currentDir, setCurrentDir] = useState('/sdcard/');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const loadFiles = useCallback(async (dir?: string) => {
    if (!tailscaleIp) return;
    setLoading(true);
    try {
      const targetDir = dir || currentDir;
      const data = await api.listFiles(deviceId, tailscaleIp, targetDir);
      setFiles(data.files || []);
      setCurrentDir(targetDir);
    } catch (err: any) {
      toast('error', err.message || '加载文件列表失败');
    }
    setLoading(false);
  }, [deviceId, tailscaleIp, currentDir]);

  useEffect(() => {
    loadFiles('/sdcard/');
  }, [tailscaleIp]);

  const handleUpload = async (fileList: FileList | File[]) => {
    if (!tailscaleIp) return;
    setUploading(true);
    const files = Array.from(fileList);
    for (const file of files) {
      try {
        await api.uploadFile(deviceId, file, tailscaleIp, currentDir);
        toast('success', `${file.name} 上传完成`);
      } catch (err: any) {
        toast('error', `${file.name} 上传失败: ${err.message}`);
      }
    }
    setUploading(false);
    loadFiles();
  };

  const handleDelete = async (filePath: string) => {
    try {
      await api.deleteFile(deviceId, tailscaleIp, filePath);
      toast('info', '已删除');
      loadFiles();
    } catch (err: any) {
      toast('error', err.message || '删除失败');
    }
  };

  const handleInstall = async (filePath: string) => {
    try {
      const result: any = await api.installApk(deviceId, tailscaleIp, filePath);
      if (result.success) {
        toast('success', 'APK 安装成功');
      } else {
        toast('error', result.output || '安装失败');
      }
    } catch (err: any) {
      toast('error', err.message || '安装失败');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files);
    }
  };

  const isApk = (name: string) => name.endsWith('.apk');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 flex items-center gap-1.5">
          <FolderOpen size={16} /> 文件管理
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => document.getElementById(`file-upload-${deviceId}`)?.click()}
            disabled={uploading}
            className="flex items-center gap-1 px-2 py-1 bg-purple-600 text-white rounded-md text-xs font-medium hover:bg-purple-700 disabled:opacity-40 transition-colors"
          >
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            上传
          </button>
          <input
            id={`file-upload-${deviceId}`}
            type="file"
            multiple
            className="hidden"
            onChange={e => e.target.files && handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-0.5 text-xs text-gray-500 mb-2 overflow-x-auto">
        {currentDir.split('/').filter(Boolean).map((seg, i, arr) => (
          <span key={i} className="flex items-center gap-0.5">
            <span className="text-gray-300">/</span>
            <button
              onClick={() => loadFiles('/' + arr.slice(0, i + 1).join('/') + '/')}
              className="hover:text-purple-600 whitespace-nowrap"
            >
              {seg}
            </button>
          </span>
        ))}
      </div>

      {/* File list */}
      <div
        className={`border-2 border-dashed rounded-lg min-h-[200px] max-h-80 overflow-y-auto transition-colors ${
          dragOver ? 'border-purple-400 bg-purple-50' : 'border-gray-200'
        }`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm">
            <Folder size={24} className="mb-1 opacity-30" />
            <p>拖拽文件到此处上传</p>
          </div>
        ) : (
          <div className="p-1">
            {files.map(file => (
              <div
                key={file.path}
                className="flex items-center gap-2 px-2 py-1.5 hover:bg-gray-50 rounded text-sm group"
              >
                {file.isDirectory ? (
                  <Folder size={14} className="text-amber-400 flex-shrink-0" />
                ) : isApk(file.name) ? (
                  <Package size={14} className="text-green-500 flex-shrink-0" />
                ) : (
                  <File size={14} className="text-gray-400 flex-shrink-0" />
                )}
                <span
                  className={`flex-1 truncate text-xs ${file.isDirectory ? 'text-purple-600 cursor-pointer font-medium' : 'text-gray-700'}`}
                  onClick={() => file.isDirectory && loadFiles(file.path)}
                >
                  {file.name}
                </span>
                <span className="text-gray-400 text-xs flex-shrink-0">{formatSize(file.size)}</span>
                <div className="hidden group-hover:flex items-center gap-0.5">
                  {isApk(file.name) && (
                    <button
                      onClick={() => handleInstall(file.path)}
                      className="p-1 hover:bg-green-100 rounded text-green-600"
                      title="安装 APK"
                    >
                      <Package size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(file.path)}
                    className="p-1 hover:bg-red-100 rounded text-red-500"
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
