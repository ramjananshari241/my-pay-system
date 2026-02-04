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

  const startRinging = () => { if (!loopIntervalRef.current) { playOneTone(); loopIntervalRef.current = setInterval(() => playOneTone(), 3000) } }
  const stopRinging = () => { if (loopIntervalRef.current) { clearInterval(loopIntervalRef.current); loopIntervalRef.current = null } }
  const playOneTone = () => { if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.volume = 0.5; audioRef.current.play().catch(e => {}) } }
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
      if (error) throw error
      setOrders(data || [])
    } catch (err: any) { console.error(err) } finally { setLoading(false) }
  }

  const handleApprove = async (id: number) => {
    if (!confirm('确认通过？')) return
    await supabase.from('orders').update({ status: 'completed' }).eq('id', id)
    fetchOrders()
  }

  // --- 新增：一键复制逻辑 ---
  const handleCopyInfo = (order: any) => {
    const qrName = qrMap[order.actual_qr_id || order.primary_qr_id] || '未知'
    const text = `${order.order_no}，${qrName}，${order.price}`
    navigator.clipboard.writeText(text)
    alert('复制成功：' + text)
  }

  const handleBanIp = async (ip: string) => {
    if (!ip || !confirm(`封禁 IP: ${ip}？`)) return
    await supabase.from('blacklisted_ips').insert([{ ip }])
    alert('封禁成功')
  }

  return (
    <div className="p-8 bg-gray-100 min-h-screen text-gray-800 font-sans relative">
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2864/2864-preview.mp3" />
      {notification && (
        <div className="fixed top-5 right-5 bg-white p-6 rounded-xl shadow-2xl border-l-8 border-orange-500 animate-bounce z-50 flex items-center gap-6 max-w-md text-gray-900">
          <div className="flex-1 font-bold">新工单待处理！<p className="text-sm font-normal">{notification}</p></div>
          <button onClick={handleCloseNotification} className="bg-black text-white px-4 py-2 rounded-lg text-xs">停止提醒</button>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-8">
          <div><h1 className="text-3xl font-bold">工单管理控制台</h1><p className="text-xs text-gray-500 mt-2 uppercase tracking-widest font-black opacity-50 font-mono">Order Management Ops</p></div>
          <button onClick={() => fetchOrders()} className="bg-white border p-2 px-6 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 transition-all">刷新数据</button>
        </div>

        <div className="bg-white p-4 rounded-xl border mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {['all', 'pending', 'completed', 'unpaid'].map(t => (
              <button key={t} onClick={() => setFilterType(t)} className={`px-4 py-2 rounded-md text-xs font-bold transition-all ${filterType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500'}`}>
                {t === 'all' ? '全部' : t === 'pending' ? '待审核' : t === 'completed' ? '已完成' : '未支付'}
              </button>
            ))}
          </div>
          <form onSubmit={e => {e.preventDefault(); fetchOrders()}} className="flex gap-2">
            <input type="text" className="border rounded-lg p-2 px-4 text-sm outline-none focus:border-blue-500 w-64" placeholder="搜索单号 / 账号..." value={keyword} onChange={e => setKeyword(e.target.value)} />
            <button className="bg-blue-600 text-white px-6 rounded-lg font-bold text-sm shadow-md">搜索</button>
          </form>
        </div>

        <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b text-xs font-bold text-gray-400 uppercase tracking-wider">
              <tr>
                <th className="p-5">工单信息</th>
                <th className="p-5">金额/业务</th>
                <th className="p-5">收款通道</th>
                <th className="p-5">客户IP/时间</th>
                <th className="p-5">状态</th>
                <th className="p-5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="p-5 font-mono font-bold text-gray-800">{o.order_no}</td>
                  <td className="p-5">
                    <div className="font-bold text-gray-900">¥{o.price}</div>
                    <div className="text-[10px] text-gray-400 font-mono">#{o.stock_id}</div>
                  </td>
                  <td className="p-5">
                    <span className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold border border-indigo-100">
                      {qrMap[o.actual_qr_id || o.primary_qr_id] || '-'}
                    </span>
                  </td>
                  <td className="p-5">
                    <div className="text-[10px] text-gray-400 font-mono">{new Date(o.created_at).toLocaleString()}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-gray-600 text-xs">{o.ip_address || '-'}</span>
                      {o.ip_address && <button onClick={() => handleBanIp(o.ip_address)} className="text-[10px] bg-red-50 text-red-500 border border-red-100 px-1 rounded hover:bg-red-500 hover:text-white transition-all">🚫</button>}
                    </div>
                  </td>
                  <td className="p-5">
                    {o.is_paid ? (
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${o.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700 animate-pulse'}`}>
                        {o.status === 'completed' ? 'Success' : 'Reviewing'}
                      </span>
                    ) : <span className="text-gray-300 text-xs font-bold uppercase tracking-widest">Waiting</span>}
                  </td>
                  <td className="p-5 text-right">
                    <div className="flex justify-end gap-2">
                       {/* 复制按钮 */}
                       <button onClick={() => handleCopyInfo(o)} className="p-2 bg-white border border-gray-200 rounded-lg hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm" title="一键复制信息">📋</button>
                       
                       {o.status === 'pending_review' && o.is_paid && (
                        <button onClick={() => handleApprove(o.id)} className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-md hover:bg-emerald-600 transition-all">通过审核</button>
                       )}
                       {o.status === 'completed' && o.screenshot_url && (
                        <a href={o.screenshot_url} target="_blank" className="p-2 px-3 bg-gray-50 border rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100">查看凭证</a>
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