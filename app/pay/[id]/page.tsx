'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/utils/supabase'

export default function ClientPayPage() {
  const params = useParams()
  const orderId = params?.id

  // --- 核心状态 ---
  const [order, setOrder] = useState<any>(null)
  const [primaryQr, setPrimaryQr] = useState<any>(null)
  const [backupQr, setBackupQr] = useState<any>(null)
  const [useBackup, setUseBackup] = useState(false)
  const [loading, setLoading] = useState(true)

  // --- 表单状态 ---
  const [account, setAccount] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isFinished, setIsFinished] = useState(false)

  // --- 验证码状态 ---
  const [captcha, setCaptcha] = useState({ q: '1+1=?', a: 2 })
  const [captchaInput, setCaptchaInput] = useState('')

  useEffect(() => {
    generateCaptcha()
    if (orderId) fetchOrderDetails()
  }, [orderId])

  const generateCaptcha = () => {
    const a = Math.floor(Math.random() * 10)
    const b = Math.floor(Math.random() * 10)
    setCaptcha({ q: `${a} + ${b} = ?`, a: a + b })
    setCaptchaInput('')
  }

  const fetchOrderDetails = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase.from('orders').select('*').eq('id', orderId).single()
      if (orderError) throw orderError
      setOrder(orderData)

      if (orderData.is_paid) {
        setIsFinished(true)
        setLoading(false)
        return
      }

      const { data: qrData, error: qrError } = await supabase.from('qr_codes').select('*').in('id', [orderData.primary_qr_id, orderData.backup_qr_id])
      if (qrError) throw qrError

      const pQr = qrData.find((q: any) => q.id === orderData.primary_qr_id)
      const bQr = qrData.find((q: any) => q.id === orderData.backup_qr_id)
      setPrimaryQr(pQr)
      setBackupQr(bQr)
    } catch (err: any) {
      alert('数据加载异常：' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleReportRestricted = async () => {
    // 提示语也去掉了“受限”这种吓人的词，改为了中性的确认
    if (!confirm('是否切换到备用支付通道？')) return
    setUseBackup(true)
    if (primaryQr && backupQr) {
      await Promise.all([
        supabase.from('qr_codes').update({ status: 'restricted' }).eq('id', primaryQr.id),
        supabase.from('qr_codes').update({ today_usage: backupQr.today_usage + 1 }).eq('id', backupQr.id)
      ])
    }
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (parseInt(captchaInput) !== captcha.a) { alert('验证码计算错误，请重试'); return }
    if (!file || !account) { alert('请填写账号并上传截图'); return }
    setSubmitting(true)

    try {
      const fileName = `pay_${order?.order_no || orderId}_${Date.now()}`
      const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName)

      const { error: updateError } = await supabase
        .from('orders')
        .update({ client_account: account, screenshot_url: publicUrl, is_paid: true, status: 'pending_review' })
        .eq('id', orderId)

      if (updateError) throw updateError
      setIsFinished(true)
    } catch (err: any) {
      alert('提交失败：' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">正在加载工单信息...</div>
  
  // === 成功页面 ===
  if (isFinished) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="h-1.5 bg-green-600 w-full"></div>
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">提交成功</h2>
          <p className="text-sm text-gray-500 mb-8">您的支付凭证已提交，工单进入审核队列</p>
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200 text-left relative">
            <p className="text-xs font-bold text-slate-400 mb-2 uppercase">工单编号 (唯一凭证)</p>
            <div className="text-2xl font-mono font-bold text-slate-800 tracking-wider mb-4 select-all bg-white border border-slate-200 p-2 rounded text-center">
              {order?.order_no}
            </div>
            <div className="space-y-2 text-sm border-t border-slate-200 pt-4">
              <div className="flex justify-between"><span className="text-gray-500">业务类型</span><span className="font-medium text-gray-800">在线充值</span></div>
              <div className="flex justify-between"><span className="text-gray-500">提交时间</span><span className="font-medium text-gray-800">{new Date().toLocaleString('zh-CN', { hour12: false })}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">当前状态</span><span className="font-bold text-orange-500">待审核</span></div>
            </div>
          </div>
        </div>
        
        {/* --- 成功页底部安全链接 --- */}
        <div className="bg-slate-50 p-4 text-center border-t border-slate-100 pb-6">
          <p className="text-xs text-red-500 font-medium mb-4">⚠️ 请截图保存当前页面，以便售后查询</p>
          
          <a 
            href="#" // 待开发落地页后，替换此处链接
            target="_blank" 
            className="inline-flex items-center justify-center gap-1.5 text-[10px] text-slate-400 hover:text-blue-600 transition-colors cursor-pointer opacity-70 hover:opacity-100"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            <span>安全支付系统 | 资金第三方托管监控中</span>
          </a>
        </div>
      </div>
    </div>
  )

  const currentQrDisplay = useBackup ? backupQr : primaryQr

  // === 支付页面 ===
  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 font-sans text-gray-800">
      <div className="max-w-md mx-auto bg-white shadow-lg rounded-lg overflow-hidden border border-slate-200">
        
        <div className="bg-white p-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-slate-800">支付工单</h1>
            <p className="text-xs text-slate-400 mt-1">NO. {order?.order_no}</p>
          </div>
          <span className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full font-bold">待支付</span>
        </div>

        <div className="p-6 text-center bg-slate-50 border-b border-slate-100">
          <p className="text-xs text-slate-500 mb-1">应付金额</p>
          <div className="text-4xl font-bold text-slate-900">
            <span className="text-2xl mr-1">¥</span>{order?.price?.toFixed(2)}
          </div>
          <div className="mt-3 inline-flex items-center text-xs text-slate-500 bg-white px-3 py-1 rounded border border-slate-200">
            <span>业务编号：</span><span className="font-mono font-bold text-slate-700 ml-1">{order?.stock_id}</span>
          </div>
        </div>

        <div className="p-8 flex flex-col items-center">
          <p className="text-sm font-bold text-slate-700 mb-4">请扫码支付</p>
          <div className="bg-white p-2 border border-slate-200 rounded shadow-sm">
             {currentQrDisplay ? (
              <img src={currentQrDisplay.image_url} alt="收款码" className="w-48 h-48 object-contain" />
            ) : <span className="text-xs text-red-400">加载收款码失败</span>}
          </div>
          
          <div className="mt-6 w-full px-4">
            {!useBackup ? (
              // --- 重点修改：中性、温和、商务风格的按钮 ---
              <button 
                onClick={handleReportRestricted} 
                className="w-full flex items-center justify-center gap-2 bg-white text-gray-600 border border-gray-300 py-3 rounded-full text-sm font-medium hover:text-black hover:border-gray-400 hover:shadow-sm transition-all duration-200"
              >
                {/* 用一个中性的刷新图标或者箭头，或者干脆只用文字 */}
                <span>无法支付？点击切换通道</span>
              </button>
            ) : (
              <div className="flex justify-center">
                <span className="text-xs text-green-700 bg-green-50 px-4 py-2 rounded-full border border-green-200 font-bold flex items-center gap-2">
                  <span>✅</span> 已为您启用备用通道
                </span>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-8 space-y-6">
          <div className="h-px bg-slate-100 w-full mb-6"></div>

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">充值账号</label>
            <input required type="text" className="w-full bg-slate-50 border border-slate-300 p-3 rounded-md text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder="请输入您的会员账号" value={account} onChange={e => setAccount(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">支付凭证</label>
            <div className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors group ${file ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}>
              <div className="flex flex-col items-center justify-center py-2">
                <span className="text-2xl mb-2">{file ? '🖼️' : '📷'}</span>
                <span className={`text-sm font-medium ${file ? 'text-blue-700' : 'text-slate-500 group-hover:text-blue-600'}`}>
                  {file ? '已选择凭证' : '点击上传截图'}
                </span>
                <span className="text-xs text-slate-400 mt-1">{file ? file.name : '支持微信/支付宝账单截图'}</span>
              </div>
              <input required type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => { if (e.target.files) setFile(e.target.files[0]) }} />
            </div>
          </div>
          
          <div className="flex items-center justify-between bg-slate-50 p-3 rounded border border-slate-200">
            <span className="text-sm font-bold text-slate-600">安全验证</span>
            <div className="flex items-center gap-3">
              <span className="font-mono font-bold text-lg text-slate-800 tracking-widest">{captcha.q}</span>
              <input required type="number" className="w-20 p-1.5 text-center border border-slate-300 rounded text-sm focus:border-blue-500 outline-none" placeholder="?" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} />
            </div>
          </div>

          <button type="submit" disabled={submitting} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-md hover:bg-black disabled:bg-slate-400 text-sm tracking-wide transition-all shadow-md active:scale-95">
            {submitting ? '正在提交...' : '确认已支付，提交审核'}
          </button>
        </form>
      </div>
      
      {/* --- 支付页底部安全链接 (Entry Point) --- */}
      <a 
        href="#" // 待开发落地页后，替换此处链接，例如：https://safe.your-domain.com
        target="_blank" 
        className="flex items-center justify-center gap-1.5 mt-8 text-xs text-slate-400 hover:text-blue-600 transition-colors cursor-pointer opacity-80 hover:opacity-100 pb-8"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
        <span>安全支付系统 | 资金第三方托管监控中</span>
      </a>
    </div>
  )
}