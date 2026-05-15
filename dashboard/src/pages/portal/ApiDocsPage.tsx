import { useEffect, useState } from 'react';

interface ApiEndpoint {
  method: string;
  path: string;
  summary: string;
  operationId: string;
}

export default function ApiDocsPage() {
  const [spec, setSpec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState('Devices');

  useEffect(() => {
    fetch('/api/v2/openapi.json')
      .then((res) => res.json())
      .then(setSpec)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const methodColor = (m: string) => {
    switch (m) {
      case 'get': return 'bg-green-100 text-green-700';
      case 'post': return 'bg-blue-100 text-blue-700';
      case 'put': return 'bg-orange-100 text-orange-700';
      case 'delete': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  }

  if (!spec) {
    return <div className="p-8 text-center text-gray-400">无法加载 API 文档</div>;
  }

  const paths = spec.paths || {};
  const tags = spec.tags || [];
  const schemas = spec.components?.schemas || {};

  // Group endpoints by tag
  const groupedByTag: Record<string, { method: string; path: string; detail: any }[]> = {};
  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, detail] of Object.entries(methods as Record<string, any>)) {
      const tag = detail.tags?.[0] || 'Other';
      if (!groupedByTag[tag]) groupedByTag[tag] = [];
      groupedByTag[tag].push({ method, path, detail });
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-2">{spec.info?.title || 'API Docs'}</h1>
        <p className="text-sm text-gray-500">{spec.info?.description}</p>
        <div className="flex gap-4 mt-2 text-sm">
          <span className="text-gray-400">Version: {spec.info?.version}</span>
          {spec.servers?.map((s: any) => (
            <code key={s.url} className="bg-gray-100 px-2 py-0.5 rounded text-xs">{s.url}</code>
          ))}
        </div>
      </div>

      {/* Tag tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tags.map((tag: any) => (
          <button
            key={tag.name}
            onClick={() => setActiveTag(tag.name)}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              activeTag === tag.name
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tag.name}
          </button>
        ))}
      </div>

      {/* Endpoints */}
      <div className="space-y-3">
        {(groupedByTag[activeTag] || []).map(({ method, path, detail }) => (
          <div key={`${method}-${path}`} className="bg-white border rounded-lg overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b">
              <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold uppercase ${methodColor(method)}`}>
                {method}
              </span>
              <code className="text-sm font-medium">{path}</code>
              <span className="text-sm text-gray-500 ml-auto">{detail.summary}</span>
            </div>
            <div className="p-4">
              {detail.description && (
                <p className="text-sm text-gray-600 mb-3">{detail.description}</p>
              )}

              {detail.parameters?.length > 0 && (
                <div className="mb-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Parameters</h4>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left px-3 py-2 text-xs text-gray-500">Name</th>
                          <th className="text-left px-3 py-2 text-xs text-gray-500">In</th>
                          <th className="text-left px-3 py-2 text-xs text-gray-500">Required</th>
                          <th className="text-left px-3 py-2 text-xs text-gray-500">Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.parameters.map((p: any) => (
                          <tr key={p.name} className="border-b last:border-b-0">
                            <td className="px-3 py-2 font-mono text-xs">{p.name}</td>
                            <td className="px-3 py-2 text-xs text-gray-500">{p.in}</td>
                            <td className="px-3 py-2 text-xs">{p.required ? 'Yes' : 'No'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-500">{p.schema?.type || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {detail.requestBody && (
                <div className="mb-3">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Request Body</h4>
                  <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">
                    {JSON.stringify(detail.requestBody.content?.['application/json']?.schema || detail.requestBody, null, 2)}
                  </pre>
                </div>
              )}

              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Responses</h4>
                <div className="flex gap-2">
                  {Object.entries(detail.responses || {}).map(([code, resp]: [string, any]) => (
                    <span key={code} className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                      <span className="font-mono font-medium">{code}</span>
                      <span className="text-gray-500 ml-1">{resp.description}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        {(!groupedByTag[activeTag] || groupedByTag[activeTag].length === 0) && (
          <div className="text-center py-12 text-gray-400">此分类下暂无端点</div>
        )}
      </div>

      {/* Authentication */}
      <div className="bg-white border rounded-lg p-6 mt-8">
        <h2 className="font-semibold mb-3">认证方式</h2>
        <p className="text-sm text-gray-600 mb-3">
          所有 Open API 请求均需在 Header 中携带 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">X-API-Key</code>
        </p>
        <pre className="bg-gray-900 text-green-400 rounded-lg p-4 text-xs overflow-x-auto">
{`curl -X GET https://phone.openedskill.com/api/v2/open/devices \\
  -H "X-API-Key: pf_your_api_key_here"`}
        </pre>
      </div>

      {/* Rate limiting */}
      <div className="bg-white border rounded-lg p-6 mt-4">
        <h2 className="font-semibold mb-3">速率限制</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">默认 QPS:</span>
            <span className="font-medium ml-2">60</span>
          </div>
          <div>
            <span className="text-gray-500">响应头:</span>
            <code className="ml-2 text-xs">X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset</code>
          </div>
          <div>
            <span className="text-gray-500">超限状态码:</span>
            <span className="font-medium ml-2">429 Too Many Requests</span>
          </div>
        </div>
      </div>
    </div>
  );
}
