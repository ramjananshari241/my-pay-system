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
  
  // --- 新增：汇款金额弹窗状态 ---
  const [remitModal, setRemitModal] = useState<{ isOpen: boolean, orderId: number | null, amount: string }>({
    isOpen: false,
    orderId: null,
    amount: ''
  })

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
      else if (filterType === 'unremitted') query = query.eq('status', 'completed').eq('is_paid', true) 
      else if (filterType === 'remitted') query = query.eq('status', 'remitted') 
      else if (filterType === 'unpaid') query = query.eq('is_paid', false)

      if (keyword.trim()) query = query.or(`order_no.ilike.%${keyword.trim()}%,client_account.ilike.%${keyword.trim()}%`)
      const { data, error } = await query
      if (!error) setOrders(data || [])
    } finally { setLoading(false) }
  }

  const handleApprove = async (id: number) => {
    if (!confirm('确认该笔资金已安全入账并审核通过？')) return
    await supabase.from('orders').update({ status: 'completed' }).eq('id', id)
    fetchOrders()
  }

  // --- 修改：点击标记汇款，打开弹窗 ---
  const handleOpenRemitModal = (id: number, defaultAmount: number) => {
    setRemitModal({ isOpen: true, orderId: id, amount: defaultAmount.toString() })
  }

  // --- 新增：提交汇款金额和状态 ---
  const confirmRemit = async () => {
    if (!remitModal.orderId || !remitModal.amount) return
    
    setLoading(true)
    const { error } = await supabase
      .from('orders')
      .update({ 
        status: 'remitted', 
        remit_amount: Number(remitModal.amount) 
      })
      .eq('id', remitModal.orderId)

    if (!error) {
      setRemitModal({ isOpen: false, orderId: null, amount: '' })
      fetchOrders()
    } else {
      alert('提交失败')
    }
    setLoading(false)
  }

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
    <div className="p-8 bg-gray-100 min-h-screen text-gray-800 font-sans relative">
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2864/2864-preview.mp3" />
      
      {/* 汇款确认弹窗 */}
      {remitModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-black mb-2 italic">CONFIRM REMITTANCE</h3>
            <p className="text-gray-500 text-sm mb-6 uppercase tracking-widest font-bold">输入实际汇出金额</p>
            
            <div className="relative mb-6">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">¥</span>
              <input 
                autoFocus
                type="number" 
                className="w-full border-2 border-gray-100 bg-gray-50 p-4 pl-10 rounded-2xl outline-none focus:border-blue-600 font-mono text-2xl font-bold transition-all"
                value={remitModal.amount}
                onChange={(e) => setRemitModal({...remitModal, amount: e.target.value})}
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setRemitModal({ isOpen: false, orderId: null, amount: '' })}
                className="flex-1 py-4 rounded-2xl font-bold text-gray-400 hover:bg-gray-100 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={confirmRemit}
                className="flex-1 py-4 rounded-2xl font-black bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-95"
              >
                确定汇款
              </button>
            </div>
          </div>
        </div>
      )}

      {notification && (
        <div className="fixed top-5 right-5 bg-white p-6 rounded-xl shadow-2xl border-l-8 border-orange-500 animate-bounce z-50 flex items-center gap-6 max-w-md text-gray-900">
          <div className="flex-1 font-bold">新工单待处理！<p className="text-sm font-normal">{notification}</p></div>
          <button onClick={handleCloseNotification} className="bg-black text-white px-4 py-2 rounded-lg text-xs font-bold">停止提醒</button>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-end mb-8 text-slate-900">
          <div><h1 className="text-3xl font-black italic uppercase tracking-tighter">ORDER MANAGEMENT / 工单监控</h1></div>
          <div className="flex gap-3">
             <a href="/admin/performance" target="_blank" className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200">📊 客服业绩统计</a>
             <button onClick={() => fetchOrders()} className="bg-white border border-gray-200 px-5 py-2.5 rounded-xl text-sm font-bold shadow-sm hover:bg-gray-50 font-mono">REFRESH</button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-gray-100 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between shadow-sm">
          <div className="flex bg-gray-100 p-1 rounded-xl overflow-x-auto max-w-full">
            {[
              { id: 'all', label: '全部' },
              { id: 'pending', label: '待审核' },
              { id: 'unremitted', label: '未汇款' },
              { id: 'remitted', label: '已汇款' },
              { id: 'unpaid', label: '未支付' }
            ].map(t => (
              <button key={t.id} onClick={() => setFilterType(t.id)} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${filterType === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <form onSubmit={e => {e.preventDefault(); fetchOrders()}} className="flex gap-2">
            <input className="border-2 border-gray-50 bg-gray-50 rounded-xl p-2 px-4 text-sm outline-none focus:border-indigo-500 w-64 transition-all" placeholder="搜单号 / 账号..." value={keyword} onChange={e => setKeyword(e.target.value)} />
            <button className="bg-indigo-500 text-white px-6 rounded-xl font-bold text-sm">搜索</button>
          </form>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50/50 border-b text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <tr>
                <th className="p-5">ORDER / 工单信息</th>
                <th className="p-5">CREATOR / 创建人</th>
                <th className="p-5">AMOUNT / 业务</th>
                <th className="p-5">CHANNEL / 通道</th>
                <th className="p-5">IP & TIME</th>
                <th className="p-5 text-center">STATUS / 状态</th>
                <th className="p-5 text-center">REMIT / 汇款</th>
                <th className="p-5 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-blue-50/30 transition-colors">
                  <td className="p-5 font-mono font-bold text-gray-800">{o.order_no}</td>
                  <td className="p-5"><span className="px-2 py-1 bg-gray-100 rounded text-[10px] font-bold text-gray-600">{o.creator_name || '-'}</span></td>
                  <td className="p-5">
                    <div className="font-black text-gray-900 text-lg">¥{o.price}</div>
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
                    <div className="flex items-center gap-2 mt-1">
                       <span className="text-[10px] text-gray-500">{o.ip_address || '-'}</span>
                       {o.ip_address && <button onClick={() => handleBanIp(o.ip_address)} className="text-[10px] opacity-30 hover:opacity-100 transition-opacity">🚫</button>}
                    </div>
                  </td>
                  <td className="p-5 text-center">
                    {o.is_paid ? (
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                        o.status === 'remitted' ? 'bg-blue-50 text-blue-400 border-blue-100' : 
                        o.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 
                        'bg-orange-100 text-orange-600 animate-pulse border-orange-200'
                      }`}>
                        {o.status === 'remitted' ? 'REMITTED' : o.status === 'completed' ? 'SUCCESS' : 'WAITING'}
                      </span>
                    ) : <span className="text-gray-300 text-[10px] font-bold uppercase tracking-widest">WAITING</span>}
                  </td>

                  <td className="p-5 text-center">
                    {o.status === 'remitted' ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-blue-600 font-black text-xs">已回款</span>
                        {/* 修改：显示实际汇款金额 */}
                        <span className="text-[10px] font-mono font-bold text-gray-400">¥{o.remit_amount || 0}</span>
                      </div>
                    ) : o.status === 'completed' ? (
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-red-500 font-black text-xs underline decoration-2 underline-offset-4 animate-pulse">待汇款</span>
                        <span className="text-[9px] text-red-300 uppercase font-bold tracking-tighter italic">Pending</span>
                      </div>
                    ) : (
                      <span className="text-gray-200 text-lg">/</span>
                    )}
                  </td>

                  <td className="p-5 text-right">
                    <div className="flex justify-end gap-2">
                       <button onClick={() => handleCopyText(o)} className="p-2 border rounded-lg hover:bg-gray-50" title="复制工单信息">📋</button>
                       
                       {o.status === 'pending_review' && (
                        <button onClick={() => handleApprove(o.id)} className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-bold text-xs shadow-md shadow-emerald-100 hover:bg-emerald-600 transition-all">通过审核</button>
                       )}

                       {o.status === 'completed' && (
                        <button onClick={() => handleOpenRemitModal(o.id, o.price)} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-xs shadow-md shadow-blue-100 hover:bg-blue-700 transition-all">标记汇款</button>
                       )}

                       {o.screenshot_url && (
                        <a href={o.screenshot_url} target="_blank" className="p-2 px-3 border rounded-lg text-xs font-bold text-gray-500 hover:text-black hover:border-black transition-all italic">支付凭证</a>
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