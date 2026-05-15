import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface WhitelabelConfig {
  id: string;
  tenantId: string;
  brandName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  customDomain: string;
  footerText: string;
  updatedAt: string;
}

export default function WhitelabelConfigPage() {
  const [config, setConfig] = useState<WhitelabelConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [brandName, setBrandName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [faviconUrl, setFaviconUrl] = useState('');
  const [primaryColor, setPrimaryColor] = useState('#3B82F6');
  const [secondaryColor, setSecondaryColor] = useState('#8B5CF6');
  const [fontFamily, setFontFamily] = useState('');
  const [customDomain, setCustomDomain] = useState('');
  const [footerText, setFooterText] = useState('');

  useEffect(() => {
    api.request('/api/v2/whitelabel/config')
      .then((data) => {
        if (data) {
          setConfig(data);
          setBrandName(data.brandName || '');
          setLogoUrl(data.logoUrl || '');
          setFaviconUrl(data.faviconUrl || '');
          setPrimaryColor(data.primaryColor || '#3B82F6');
          setSecondaryColor(data.secondaryColor || '#8B5CF6');
          setFontFamily(data.fontFamily || '');
          setCustomDomain(data.customDomain || '');
          setFooterText(data.footerText || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const data = await api.request('/api/v2/whitelabel/config', {
        method: 'PUT',
        body: JSON.stringify({
          brandName: brandName || undefined,
          logoUrl: logoUrl || undefined,
          faviconUrl: faviconUrl || undefined,
          primaryColor,
          secondaryColor,
          fontFamily: fontFamily || undefined,
          customDomain: customDomain || undefined,
          footerText: footerText || undefined,
        }),
      });
      setConfig(data);
      setSuccess('配置保存成功');
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">白标配置</h1>
      <p className="text-sm text-gray-500 mb-6">自定义品牌外观：品牌名称、Logo、配色、自定义域名</p>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
          <p className="text-green-700 text-sm">{success}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Preview card */}
      <div className="bg-white border rounded-lg p-6 mb-6">
        <h2 className="font-semibold mb-4">实时预览</h2>
        <div
          className="border rounded-lg p-6"
          style={{ backgroundColor: '#f9fafb' }}
        >
          <div className="flex items-center gap-3 mb-4">
            {logoUrl && <img src={logoUrl} alt="Logo" className="h-8" />}
            <h3 className="text-lg font-bold" style={{ color: primaryColor }}>
              {brandName || 'PhoneFarm'}
            </h3>
          </div>
          <div className="flex gap-2 mb-4">
            <div className="w-20 h-4 rounded" style={{ backgroundColor: primaryColor }} />
            <div className="w-20 h-4 rounded" style={{ backgroundColor: secondaryColor }} />
          </div>
          <div className="h-32 bg-white border rounded flex items-center justify-center text-gray-400 text-sm">
            {brandName || 'PhoneFarm'} Portal Preview
          </div>
          {footerText && (
            <p className="text-xs text-gray-400 mt-4 text-center">{footerText}</p>
          )}
        </div>
      </div>

      {/* Edit form */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="font-semibold">配置编辑</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">品牌名称</label>
            <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="PhoneFarm" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">自定义域名</label>
            <input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="portal.yourcompany.com" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Logo URL</label>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Favicon URL</label>
            <input value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} placeholder="https://..." className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              主色调
              <span className="inline-block w-4 h-4 rounded ml-2 border" style={{ backgroundColor: primaryColor }} />
            </label>
            <div className="flex gap-2">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-10 border rounded cursor-pointer" />
              <input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              辅助色
              <span className="inline-block w-4 h-4 rounded ml-2 border" style={{ backgroundColor: secondaryColor }} />
            </label>
            <div className="flex gap-2">
              <input type="color" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="w-10 h-10 border rounded cursor-pointer" />
              <input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">字体</label>
            <input value={fontFamily} onChange={(e) => setFontFamily(e.target.value)} placeholder="例如: Inter, sans-serif" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">页脚文本</label>
            <input value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder="例如: © 2026 Your Company" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex gap-2 pt-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>
    </div>
  );
}
