'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

export default function CreateOrderPage() {
  const [stockId, setStockId] = useState('')
  const [price, setPrice] = useState('')
  const [staffList, setStaffList] = useState<any[]>([])
  const [creator, setCreator] = useState('')
  const [loading, setLoading] = useState(false)
  const [orderLink, setOrderLink] = useState('')
  const [copied, setCopied] = useState(false)

  // 获取员工列表
  useEffect(() => {
    const getStaff = async () => {
      const { data } = await supabase.from('staff').select('name').order('id', { ascending: true })
      if (data && data.length > 0) {
        setStaffList(data)
        setCreator(data[0].name) // 默认选第一个
      }
    }
    getStaff()
  }, [])

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
    if (!creator) return alert('请先在员工库添加客服人员')
    setLoading(true)
    setOrderLink('')

    try {
      const orderNo = generateOrderNo()
      // 创建订单（此时不分配二维码，由客户在支付页选择）
      const { data: orderData, error: createError } = await supabase
        .from('orders')
        .insert([{
            stock_id: stockId,
            price: Number(price),
            order_no: orderNo,
            creator_name: creator, // 记录创建人
            status: 'pending',
            is_paid: false
          }])
        .select()

      if (createError) throw createError

      const link = `${window.location.origin}/pay/${orderData[0].id}`
      setOrderLink(link)
      alert('工单创建成功')

    } catch (error: any) {
      alert('创建失败：' + error.message)
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
    <div className="min-h-screen bg-gray-50 p-10 text-gray-900 font-sans">
      <div className="max-w-md mx-auto bg-white p-8 rounded-[2rem] shadow-xl border border-gray-100">
        <h1 className="text-xl font-black uppercase mb-8 tracking-widest text-center italic text-gray-800">New Order / 新建工单</h1>
        
        <form onSubmit={handleCreateOrder} className="space-y-5">
          {/* 创建人选择 */}
          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Creator / 创建人</label>
            <select 
              className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-black appearance-none bg-gray-50 font-bold" 
              value={creator} 
              onChange={e => setCreator(e.target.value)}
            >
              {staffList.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Business ID / 库存号</label>
            <input required className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-black font-mono" value={stockId} onChange={e => setStockId(e.target.value)} placeholder="例如：VIP-001" />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest ml-1">Amount / 金额 (元)</label>
            <input required type="number" className="w-full border-2 border-gray-100 p-3 rounded-xl outline-none focus:border-black font-bold text-lg" value={price} onChange={e => setPrice(e.target.value)} placeholder="0.00" />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-black text-white py-4 rounded-xl font-bold hover:opacity-80 transition-all uppercase tracking-widest text-xs shadow-lg active:scale-95">
            {loading ? 'Processing...' : '创建订单'}
          </button>
        </form>

        {orderLink && (
          <div className="mt-8 animate-in fade-in zoom-in duration-300">
            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest text-center mb-2">Ready to Dispatch</p>
            <div className="bg-gray-50 p-4 border border-dashed border-gray-300 rounded-xl font-mono text-[10px] break-all text-gray-500 mb-4">
              {orderLink}
            </div>
            <button 
              className={`w-full py-3 rounded-xl font-bold transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`} 
              onClick={handleCopy}
            >
              {copied ? '复制成功 ✅' : '复制订单链接'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}