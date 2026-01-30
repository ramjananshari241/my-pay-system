'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/utils/supabase'

export default function OrderManagementPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [keyword, setKeyword] = useState('')
  
  // 收款码名称字典
  const [qrMap, setQrMap] = useState<{[key: number]: string}>({})

  const [notification, setNotification] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loopIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    fetchOrders()
    
    // --- 实时监听逻辑 ---
    const channel = supabase
      .channel('orders-realtime')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
        const newOrder = payload.new as any
        const oldOrder = payload.old as any
        
        // 状态变为待审核时触发响铃和通知
        if (newOrder.status === 'pending_review' && oldOrder.status !== 'pending_review') {
          startRinging()
          setNotification(`🔔 新工单提交！单号: ${newOrder.order_no} (¥${newOrder.price})`)
          fetchOrders()
        }
      })
      .subscribe()
    
    return () => { stopRinging(); supabase.removeChannel(channel) }
  }, [filterType])

  // --- 持续响铃控制 ---
  const startRinging = () => {
    if (loopIntervalRef.current) return
    playOneTone()
    loopIntervalRef.current = setInterval(() => playOneTone(), 3000)
  }
  const stopRinging = () => {
    if (loopIntervalRef.current) { clearInterval(loopIntervalRef.current); loopIntervalRef.current = null }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 }
  }
  const playOneTone = () => {
    if (audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.volume = 0.5; audioRef.current.play().catch(e => console.log('音频播放受限')) }
  }
  const handleCloseNotification = () => { setNotification(null); stopRinging() }

  // --- 数据拉取 ---
  const fetchOrders = async () => {
    setLoading(true)
    try {
      // 1. 获取码字典
      const { data: qrData } = await supabase.from('qr_codes').select('id, name')
      const map: {[key: number]: string} = {}
      if (qrData) qrData.forEach((q: any) => { map[q.id] = q.name })
      setQrMap(map)

      // 2. 获取订单列表 (按ID倒序)
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

  const handleSearch = (e: any) => { e.preventDefault(); fetchOrders() }

  // 审核通过逻辑
  const handleApprove = async (id: number) => {
    if (!confirm('确认核实无误并审核通过吗？')) return
    const { error } = await supabase.from('orders').update({ status: 'completed' }).eq('id', id)
    if (!error) {
      setOrders(orders.map(o => o.id === id ? { ...o, status: 'completed' } : o))
    }
  }

  // 封禁IP逻辑
  const handleBanIp = async (ip: string) => {
    if (!ip) return
    if (!confirm(`确定要永久屏蔽 IP: ${ip} 吗？`)) return
    try {
      const { error } = await supabase.from('blacklisted_ips').insert([{ ip: ip }])
      if (error) throw error
      alert(`IP ${ip} 已加入黑名单！`)
    } catch (err: any) { alert('封禁失败: ' + err.message) }
  }

  return (
    <div className="p-8 bg-gray-100 min-h-screen text-gray-800 font-sans relative">
      <audio ref={audioRef} preload="auto" src="https://assets.mixkit.co/active_storage/sfx/2864/2864-preview.mp3" />
      
      {/* 实时通知弹窗 */}
      {notification && (
        <div className="fixed top-5 right-5 bg-white text-gray-900 p-6 rounded-xl shadow-2xl border-l-8 border-orange-500 animate-bounce z-50 flex items-center gap-6 max-w-md">
          <div className="flex-1">
            <h3 className="font-bold text-xl flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full animate-ping"></span>
              新工单待处理
            </h3>
            <p className="text-gray-600 mt-1">{notification}</p>
            <p className="text-xs text-orange-500 mt-2 font-bold animate-pulse">持续响铃中...</p>
          </div>
          <button onClick={handleCloseNotification} className="bg-gray-900 text-white hover:bg-black px-5 py-3 rounded-lg font-bold text-sm shadow-lg whitespace-nowrap">收到 / 停止响铃</button>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* 顶部标题栏 */}
        <div className="flex justify-between items-end mb-8">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">工单管理控制台</h1>
              <p className="text-sm text-gray-500 mt-2">共找到 {orders.length} 条记录</p>
            </div>
            <button onClick={() => { playOneTone(); alert('声音测试正常') }} className="text-xs bg-white border border-gray-300 px-3 py-1.5 rounded hover:bg-gray-50 flex items-center gap-2 text-blue-600 font-bold shadow-sm">🔊 测试音效</button>
          </div>
          <button onClick={() => fetchOrders()} className="bg-white border border-gray-300 px-4 py-2 rounded text-gray-600 hover:bg-gray-50 text-sm font-medium shadow-sm">刷新列表数据</button>
        </div>

        {/* 筛选与搜索 */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {[{ id: 'all', label: '全部' }, { id: 'pending', label: '待审核' }, { id: 'completed', label: '已完成' }, { id: 'unpaid', label: '未支付' }].map(tab => (
              <button key={tab.id} onClick={() => setFilterType(tab.id)} className={`px-4 py-2 text-sm font-bold rounded-md transition-all ${filterType === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{tab.label}</button>
            ))}
          </div>
          <form onSubmit={handleSearch} className="flex w-full md:w-auto gap-2">
            <input type="text" className="w-64 p-2 border border-gray-300 rounded text-sm outline-none focus:border-blue-500" placeholder="搜工单号 / 账号..." value={keyword} onChange={e => setKeyword(e.target.value)} />
            <button className="bg-blue-600 text-white px-4 py-2 rounded text-sm font-bold shadow-sm hover:bg-blue-700">搜索</button>
          </form>
        </div>

        {/* 数据表格 - 已移除复选框列 */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="p-4">工单号/ID</th>
                <th className="p-4">账号信息</th>
                <th className="p-4">金额/业务</th>
                <th className="p-4">收款通道</th>
                <th className="p-4">时间/IP</th>
                <th className="p-4">凭证</th>
                <th className="p-4">状态</th>
                <th className="p-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading && <tr><td colSpan={8} className="p-10 text-center text-gray-400 italic">正在努力加载数据...</td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-gray-400">暂无相关记录</td></tr>}
              {orders.map(order => (
                <tr key={order.id} className="hover:bg-blue-50/50 transition-colors">
                  <td className="p-4"><div className="font-mono font-bold text-gray-800">{order.order_no}</div><div className="text-xs text-gray-400">ID: {order.id}</div></td>
                  
                  {/* 账号信息格式保持优化后的版本 */}
                  <td className="p-4">
                    <div className="space-y-1 text-sm text-gray-700">
                      <div>昵称：{order.client_nickname || '-'}</div>
                      <div>账号：{order.client_account || '-'}</div>
                      <div>密码：{order.client_password || '-'}</div>
                    </div>
                  </td>
                  
                  <td className="p-4"><div className="font-bold text-gray-900">¥{order.price}</div><div className="text-xs text-gray-500">{order.stock_id}</div></td>
                  
                  {/* 收款通道显示 (actual_qr_id 优先逻辑) */}
                  <td className="p-4">
                    {order.is_paid ? (
                      <span className="inline-block px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium border border-blue-100">
                        {qrMap[order.actual_qr_id || order.primary_qr_id] || '未知或已删除'}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">-</span>
                    )}
                  </td>

                  <td className="p-4">
                    <div className="text-gray-600 text-xs">{order.created_at ? new Date(order.created_at).toLocaleString() : '-'}</div>
                    {order.ip_address && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="font-mono text-xs text-gray-400">{order.ip_address}</span>
                        <button onClick={() => handleBanIp(order.ip_address)} className="text-[10px] text-red-400 hover:text-red-600 border border-red-200 px-1 rounded hover:bg-red-50 transition-colors" title="封禁此IP">🚫</button>
                      </div>
                    )}
                  </td>
                  
                  <td className="p-4">{order.screenshot_url ? <a href={order.screenshot_url} target="_blank" className="relative group block w-10 h-10 border rounded overflow-hidden shadow-sm"><img src={order.screenshot_url} className="w-full h-full object-cover" /></a> : '-'}</td>
                  
                  <td className="p-4">
                    {!order.is_paid ? <span className="px-2 py-1 rounded bg-gray-100 text-gray-500 text-xs">未支付</span> : 
                     order.status === 'completed' ? <span className="px-2 py-1 rounded bg-green-100 text-green-700 text-xs font-bold border border-green-200">✅ 已完成</span> : 
                     order.status === 'pending_review' ? <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-700 text-xs font-bold border border-yellow-200 animate-pulse">⏳ 待审核</span> : 
                     <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs">{order.status}</span>}
                  </td>
                  
                  {/* 操作列：仅保留通过按钮，移除删除 */}
                  <td className="p-4 text-right">
                    {order.status === 'pending_review' && order.is_paid && (
                      <button 
                        onClick={() => handleApprove(order.id)} 
                        className="px-4 py-1.5 bg-green-50 text-green-600 border border-green-200 rounded-md hover:bg-green-600 hover:text-white hover:scale-105 hover:shadow-md transition-all duration-200 text-xs font-bold"
                      >
                        通过审核
                      </button>
                    )}
                    {order.status === 'completed' && <span className="text-xs text-gray-400">已处理</span>}
                    {!order.is_paid && <span className="text-xs text-gray-300 italic">等待中</span>}
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