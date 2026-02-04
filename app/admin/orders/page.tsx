'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/utils/supabase'

export default function OrderManagementPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [qrMap, setQrMap] = useState<{[key: number]: string}>({})

  const [notification, setNotification] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchOrders()
    const channel = supabase.channel('orders-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const newOrder = payload.new as any; const oldOrder = payload.old as any
        if (newOrder.status === 'pending_review' && oldOrder.status !== 'pending_review') {
          startRinging(); setNotification(`🔔 新工单提交！单号: ${newOrder.order_no}`); fetchOrders()
        }
      }).subscribe()
    return () => { stopRinging(); supabase.removeChannel(channel) }
  }, [filterType])

  const startRinging = () => {
    if (loopIntervalRef.current) return
    const play = () => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play() } }
    play(); loopIntervalRef.current = setInterval(play, 3000)
  }
  const stopRinging = () => { if (loopIntervalRef.current) { clearInterval(loopIntervalRef.current); loopIntervalRef.current = null } }
  const handleCloseNotification = () => { setNotification(null); stopRinging() }

  const fetchOrders = async () => {
    setLoading(true)
    try {
      const { data: qrData } = await supabase.from('qr_codes').select('id, name')
      const map: {[key: number]: string} = {}
      if (qrData) qrData.forEach((q: any) => { map[q.id] = q.name })
      setQrMap(map)

      let query = supabase.from('orders').select('*').order('id', { ascending: false })
      if (filterType === 'pending') query = query.eq('status', 'pending_review')
      else if (filterType === 'completed') query = query.eq('status', 'completed')
      else if (filterType === 'unpaid') query = query.eq('is_paid', false)
      
      if (keyword.trim()) query = query.or(`order_no.ilike.%${keyword.trim()}%,client_account.ilike.%${keyword.trim()}%`)
      const { data, error } = await query
      if (!error) setOrders(data || [])
    } finally { setLoading(false) }
  }

  const handleApprove = async (id: number) => {
    if (!confirm('确认通过？')) return
    await supabase.from('orders').update({ status: 'completed' }).eq('id', id)
    fetchOrders()
  }

  // 一键复制功能：工单号，收款码，金额
  const handleCopyText = (o: any) => {
    const qrName = qrMap[o.actual_qr_id || o.primary_qr_id] || '未知'
    const text = `${o.order_no}，${qrName}，${o.price}`
    navigator.clipboard.writeText(text)
    alert('已复制：' + text)
  }

  const handleBanIp = async (ip: string) => {
    if (ip && confirm(`屏蔽 IP: ${ip}？`)) {
      await supabase.from('blacklisted_ips').insert([{ ip }])
      alert('已封禁')
    }
  }

  return (
    <div className="p-8 bg-gray-50 min-h-screen text-gray-800 font-sans relative">
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2864/2864-preview.mp3" />
      
      {notification && (
        <div className="fixed top-5 right-5 bg-white p-6 rounded-2xl shadow-2xl border-l-8 border-orange-500 animate-bounce z-50 flex items-center gap-6 max-w-md">
          <div className="flex-1"><h3 className="font-bold">新工单待处理</h3><p className="text-sm text-gray-500">{notification}</p></div>
          <button onClick={handleCloseNotification} className="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold">停止铃声</button>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-8">
          <div><h1 className="text-3xl font-black italic uppercase tracking-tighter">Order Control / 工单管理</h1></div>
          <div className="flex gap-3">
             {/* 业绩统计按钮 */}
             <a href="/admin/performance" target="_blank" className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all">📊 客服业绩统计</a>
             <button onClick={() => fetchOrders()} className="bg-white border border-gray-200 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-gray-50">刷新数据</button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
          <div className="flex bg-gray-50 p-1 rounded-xl">
            {['all', 'pending', 'completed', 'unpaid'].map(t => (
              <button key={t} onClick={() => setFilterType(t)} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all ${filterType === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>
                {t === 'all' ? '全部' : t === 'pending' ? '待审核' : t === 'completed' ? '已完成' : '未支付'}
              </button>
            ))}
          </div>
          <form onSubmit={e => {e.preventDefault(); fetchOrders()}} className="flex gap-2">
            <input className="border-2 border-gray-50 bg-gray-50 rounded-xl p-2 px-4 text-sm outline-none focus:border-indigo-500 w-64 transition-all" placeholder="搜单号 / 账号..." value={keyword} onChange={e => setKeyword(e.target.value)} />
            <button className="bg-indigo-500 text-white px-6 rounded-xl font-bold text-sm">搜索</button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 border-b text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
              <tr>
                <th className="p-5">Order Detail / 工单信息</th>
                <th className="p-5">creator / 创建人</th>
                <th className="p-5">Amount / 业务</th>
                <th className="p-5">Channel / 通道</th>
                <th className="p-5">IP & Time / 时间</th>
                <th className="p-5">Status / 状态</th>
                <th className="p-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="p-5 font-mono font-bold text-gray-900">{o.order_no}</td>
                  <td className="p-5"><span className="px-2 py-1 bg-gray-100 rounded text-[10px] font-bold text-gray-600">{o.creator_name || '-'}</span></td>
                  <td className="p-5">
                    <div className="font-black text-gray-900">¥{o.price}</div>
                    <div className="text-[10px] text-gray-400 font-mono">#{o.stock_id}</div>
                  </td>
                  <td className="p-5">
                    {o.is_paid ? (
                      <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-black border border-indigo-100">
                        {qrMap[o.actual_qr_id || o.primary_qr_id] || 'N/A'}
                      </span>
                    ) : <span className="text-gray-300">-</span>}
                  </td>
                  <td className="p-5">
                    <div className="text-[10px] text-gray-400 font-mono mb-1">{new Date(o.created_at).toLocaleString()}</div>
                    <div className="flex items-center gap-1">
                       <span className="text-[10px] text-gray-500">{o.ip_address || '-'}</span>
                       {o.ip_address && <button onClick={() => handleBanIp(o.ip_address)} className="text-[10px] opacity-30 hover:opacity-100 transition-opacity">🚫</button>}
                    </div>
                  </td>
                  <td className="p-5">
                    {o.is_paid ? (
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-600 animate-pulse'}`}>
                        {o.status === 'completed' ? 'Success' : 'Reviewing'}
                      </span>
                    ) : <span className="text-gray-300 text-[10px] font-bold uppercase tracking-widest">Waiting</span>}
                  </td>
                  <td className="p-5 text-right">
                    <div className="flex justify-end gap-2">
                       <button onClick={() => handleCopyText(o)} className="p-2 border rounded-lg hover:bg-gray-50" title="复制工单信息">📋</button>
                       {o.status === 'pending_review' && (
                        <button onClick={() => handleApprove(o.id)} className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-all">通过</button>
                       )}
                       {o.screenshot_url && (
                        <a href={o.screenshot_url} target="_blank" className="p-2 px-3 border rounded-lg text-xs font-bold text-gray-400 hover:text-black transition-colors italic">P.O.P</a>
                       )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}