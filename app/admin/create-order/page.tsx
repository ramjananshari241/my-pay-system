'use client'

import { useState } from 'react'
import { supabase } from '@/utils/supabase'

export default function CreateOrderPage() {
  const [stockId, setStockId] = useState('')
  const [price, setPrice] = useState('')
  const [groupName, setGroupName] = useState('集合1')
  const [loading, setLoading] = useState(false)
  const [orderLink, setOrderLink] = useState('')
  
  // --- 新增：控制复制成功状态 ---
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
    setCopied(false) // 重置复制状态

    try {
      const { data: candidates, error: fetchError } = await supabase
        .from('qr_codes')
        .select('*')
        .eq('group_name', groupName)
        .eq('status', 'active')
      
      if (fetchError) throw fetchError

      const availableQRs = candidates.filter(qr => qr.today_usage < qr.daily_limit)

      if (availableQRs.length < 2) {
        alert(`【${groupName}】可用收款码不足2张`)
        setLoading(false)
        return
      }

      const shuffled = availableQRs.sort(() => 0.5 - Math.random())
      const primaryQR = shuffled[0]
      const backupQR = shuffled[1]
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

      await supabase
        .from('qr_codes')
        .update({ today_usage: primaryQR.today_usage + 1 })
        .eq('id', primaryQR.id)

      const link = `${window.location.origin}/pay/${newOrderId}`
      setOrderLink(link)
      alert('工单创建成功')

    } catch (error: any) {
      console.error(error)
      alert('失败：' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 处理复制逻辑
  const handleCopy = () => {
    navigator.clipboard.writeText(orderLink)
    setCopied(true)
    // 2秒后恢复原状
    setTimeout(() => {
      setCopied(false)
    }, 2000)
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
          </div>
          <button type="submit" disabled={loading} className="w-full bg-black text-white p-4 rounded-lg font-bold hover:bg-gray-800">{loading ? '生成中...' : '生成工单链接'}</button>
        </form>

        {orderLink && (
          <div className="mt-8 p-6 border-2 border-black rounded bg-white text-center">
            <p className="font-bold mb-3">工单已生成</p>
            <div className="bg-gray-100 p-4 border rounded font-mono mb-4 break-all">{orderLink}</div>
            
            {/* 改进后的复制按钮 */}
            <button 
              className={`px-6 py-2 rounded font-bold transition-all duration-300 ${copied ? 'bg-green-600 text-white scale-105' : 'bg-black text-white hover:bg-gray-800'}`} 
              onClick={handleCopy}
            >
              {copied ? '已复制 ✅' : '点击复制链接'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}