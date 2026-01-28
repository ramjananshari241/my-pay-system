'use client'

import { useState } from 'react'
import { supabase } from '@/utils/supabase'

export default function CreateOrderPage() {
  const [stockId, setStockId] = useState('')
  const [price, setPrice] = useState('')
  const [groupName, setGroupName] = useState('集合1')
  const [loading, setLoading] = useState(false)
  const [orderLink, setOrderLink] = useState('')
  const [copied, setCopied] = useState(false)

  const generateOrderNo = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const random = Math.floor(1000 + Math.random() * 9000)
    return `${year}${month}${day}-${random}`
  }

  const handleCreateOrder = async (e: any) => {
    e.preventDefault()
    setLoading(true)
    setOrderLink('')
    setCopied(false)

    try {
      // 1. 获取候选码
      const { data: candidates, error: fetchError } = await supabase
        .from('qr_codes')
        .select('*')
        .eq('group_name', groupName)
        .eq('status', 'active')
      
      if (fetchError) throw fetchError

      // 2. 过滤掉满额的
      // 注意：现在的 usage 只有客户付款了才涨，所以这里是在限制“成功单量”
      const availableQRs = candidates.filter(qr => qr.today_usage < qr.daily_limit)

      if (availableQRs.length < 2) {
        alert(`【${groupName}】可用收款码不足2张 (满额或无码)`)
        setLoading(false)
        return
      }

      // 3. --- 新算法：负载均衡 (防连续) ---
      // 按照 "上次被选中的时间" 排序，空值(从未被选过)排最前，时间越早排越前
      availableQRs.sort((a, b) => {
        const timeA = a.last_selected_at ? new Date(a.last_selected_at).getTime() : 0
        const timeB = b.last_selected_at ? new Date(b.last_selected_at).getTime() : 0
        return timeA - timeB
      })

      // 取前两张（也就是最久没被用过的两张）
      const primaryQR = availableQRs[0]
      const backupQR = availableQRs[1]

      // 4. 创建订单
      const orderNo = generateOrderNo()
      const { data: orderData, error: createError } = await supabase
        .from('orders')
        .insert([{
            stock_id: stockId,
            price: Number(price),
            primary_qr_id: primaryQR.id,
            backup_qr_id: backupQR.id,
            order_no: orderNo,
            status: 'pending',
            is_paid: false
          }])
        .select()

      if (createError) throw createError

      const newOrderId = orderData[0].id

      // 5. --- 关键修改：只更新 last_selected_at，不更新 today_usage ---
      // 这样它们会排到队尾，下次不会被马上选中，但次数不增加
      await Promise.all([
        supabase.from('qr_codes').update({ last_selected_at: new Date() }).eq('id', primaryQR.id),
        supabase.from('qr_codes').update({ last_selected_at: new Date() }).eq('id', backupQR.id)
      ])

      const link = `${window.location.origin}/pay/${newOrderId}`
      setOrderLink(link)
      alert('工单创建成功！')

    } catch (error: any) {
      console.error(error)
      alert('失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(orderLink)
    setCopied(true)
    setTimeout(() => { setCopied(false) }, 2000)
  }

  return (
    <div className="min-h-screen bg-gray-100 text-gray-900 p-10">
       <div className="max-w-lg mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">创建工单 (专业版)</h1>
        
        <form onSubmit={handleCreateOrder} className="space-y-6 bg-white p-8 rounded-xl shadow-lg border border-gray-200">
          <div>
            <label className="block mb-2 font-bold text-gray-700">库存号</label>
            <input type="text" className="w-full border-2 border-gray-300 p-3 rounded-lg" value={stockId} onChange={e => setStockId(e.target.value)} />
          </div>
          <div>
            <label className="block mb-2 font-bold text-gray-700">价格 (元)</label>
            <input type="number" className="w-full border-2 border-gray-300 p-3 rounded-lg" value={price} onChange={e => setPrice(e.target.value)} />
          </div>
          <div>
            <label className="block mb-2 font-bold text-gray-700">集合</label>
            <select className="w-full border-2 border-gray-300 p-3 rounded-lg" value={groupName} onChange={e => setGroupName(e.target.value)}>
              <option value="集合1">集合1</option>
              <option value="集合2">集合2</option>
              <option value="集合3">集合3</option>
            </select>
            <p className="text-xs text-gray-500 mt-2">系统将自动优选最久未使用的二维码，避免连续重复。</p>
          </div>
          <button type="submit" disabled={loading} className="w-full bg-black text-white p-4 rounded-lg font-bold hover:bg-gray-800">{loading ? '生成中...' : '生成工单链接'}</button>
        </form>

        {orderLink && (
          <div className="mt-8 p-6 border-2 border-black rounded bg-white text-center">
            <p className="font-bold mb-3">工单已生成</p>
            <div className="bg-gray-100 p-4 border rounded font-mono mb-4 break-all">{orderLink}</div>
            <button className={`px-6 py-2 rounded font-bold transition-all duration-300 ${copied ? 'bg-green-600 text-white scale-105' : 'bg-black text-white hover:bg-gray-800'}`} onClick={handleCopy}>{copied ? '已复制 ✅' : '点击复制链接'}</button>
          </div>
        )}
      </div>
    </div>
  )
}