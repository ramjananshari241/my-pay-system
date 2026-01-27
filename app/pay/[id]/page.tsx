'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/utils/supabase'

export default function ClientPayPage() {
  const params = useParams()
  const orderId = params?.id

  const [order, setOrder] = useState<any>(null)
  const [primaryQr, setPrimaryQr] = useState<any>(null)
  const [backupQr, setBackupQr] = useState<any>(null)
  const [useBackup, setUseBackup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isBanned, setIsBanned] = useState(false)

  // --- 倒计时状态：10分钟 = 600,000 毫秒 ---
  const [timeLeft, setTimeLeft] = useState(600000)

  const [account, setAccount] = useState('')
  const [nickname, setNickname] = useState('') 
  const [password, setPassword] = useState('') 
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [clientIp, setClientIp] = useState('')

  const [captcha, setCaptcha] = useState({ q: '1+1=?', a: 2 })
  const [captchaInput, setCaptchaInput] = useState('')

  useEffect(() => {
    generateCaptcha()
    checkIpAndLoadOrder()
  }, [orderId])

  // --- 毫秒级倒计时逻辑 ---
  useEffect(() => {
    if (isFinished || loading) return

    // 每 10 毫秒更新一次，实现飞速倒数效果
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) {
          clearInterval(timer)
          return 0
        }
        return prev - 10 // 每次扣除 10ms
      })
    }, 10)

    return () => clearInterval(timer)
  }, [isFinished, loading])

  // --- 时间格式化：M:SS:ms (例如 9:59:99) ---
  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const m = Math.floor(totalSeconds / 60).toString()
    const s = (totalSeconds % 60).toString().padStart(2, '0')
    // 取毫秒的前两位 (0-99)
    const centiseconds = Math.floor((ms % 1000) / 10).toString().padStart(2, '0')
    return `${m}:${s}:${centiseconds}`
  }

  const checkIpAndLoadOrder = async () => {
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json')
      const ipData = await ipRes.json()
      const ip = ipData.ip
      setClientIp(ip)

      const { data: bannedData } = await supabase.from('blacklisted_ips').select('*').eq('ip', ip)
      
      if (bannedData && bannedData.length > 0) {
        setIsBanned(true)
        setLoading(false)
        return 
      }
      fetchOrderDetails()
    } catch (e) {
      console.error('IP Check Failed', e)
      fetchOrderDetails()
    }
  }

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
    if (!file || !account) { alert('请填写完整信息并上传截图'); return }
    setSubmitting(true)

    try {
      const fileName = `pay_${order?.order_no || orderId}_${Date.now()}`
      const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName)

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          client_account: account,
          client_nickname: nickname,
          client_password: password,
          ip_address: clientIp,
          screenshot_url: publicUrl,
          is_paid: true,
          status: 'pending_review'
        })
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
  
  if (isBanned) return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-10">
      <div className="text-center">
        <h1 className="text-4xl mb-4">🚫</h1>
        <h2 className="text-2xl font-bold text-red-800 mb-2">访问被拒绝</h2>
        <p className="text-red-600">您的IP地址 ({clientIp}) 存在异常行为，已被系统屏蔽。</p>
      </div>
    </div>
  )

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
        <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
          <p className="text-xs text-red-500 font-medium">⚠️ 请截图保存当前页面，以便售后查询</p>
          <a href="#" target="_blank" className="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-slate-400 hover:text-blue-600 transition-colors cursor-pointer opacity-70 hover:opacity-100">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            <span>安全支付系统 | 资金第三方托管监控中</span>
          </a>
        </div>
      </div>
    </div>
  )

  const currentQrDisplay = useBackup ? backupQr : primaryQr

  return (
    <div className="min-h-screen bg-slate-100 py-8 px-4 font-sans text-gray-800">
      <div className="max-w-md mx-auto bg-white shadow-lg rounded-lg overflow-hidden border border-slate-200">
        
        {/* --- Header: 包含毫秒级倒计时 --- */}
        <div className="bg-white p-5 border-b border-slate-100 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-slate-800">支付工单</h1>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-xs text-slate-400">NO. {order?.order_no}</p>
              <span className="text-slate-200">|</span>
              {/* 无图标，纯文字，等宽字体，毫秒级跳动 */}
              <p className="text-xs text-orange-600 font-bold tracking-wide">
                请在 <span className="font-mono text-sm">{formatTime(timeLeft)}</span> 内完成支付
              </p>
            </div>
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
          
          <div className="w-full mt-4 bg-yellow-50 border border-yellow-100 p-3 rounded-lg text-center">
            <p className="text-xs text-yellow-800 font-medium">
              ⚠️ 温馨提示：付款时请务必备注您的【业务编号】，否则无法自动到账。
            </p>
          </div>

          <div className="mt-4 w-full">
            {!useBackup ? (
              <button 
                onClick={handleReportRestricted} 
                className="w-full flex items-center justify-center gap-2 bg-white text-gray-600 border border-gray-300 py-3 rounded-full text-sm font-medium hover:text-black hover:border-gray-400 hover:shadow-sm transition-all duration-200"
              >
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
            <label className="block text-sm font-bold text-slate-700">会员昵称</label>
            <input type="text" className="w-full bg-slate-50 border border-slate-300 p-3 rounded-md text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder="方便核对（选填）" value={nickname} onChange={e => setNickname(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">会员账号 (必填)</label>
            <input required type="text" className="w-full bg-slate-50 border border-slate-300 p-3 rounded-md text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder="请输入您的会员账号" value={account} onChange={e => setAccount(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-bold text-slate-700">充值密码/安全码</label>
            <input type="text" className="w-full bg-slate-50 border border-slate-300 p-3 rounded-md text-sm outline-none focus:border-blue-500 focus:bg-white transition-all" placeholder="如业务需要请填写（选填）" value={password} onChange={e => setPassword(e.target.value)} />
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
      <div className="text-center mt-8 text-xs text-slate-400">安全支付系统 | 24小时自动监控</div>
    </div>
  )
}