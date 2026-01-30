'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/utils/supabase'

export default function ClientPayPage() {
  const params = useParams()
  const orderId = params?.id

  // --- 状态定义 ---
  const [order, setOrder] = useState<any>(null)
  const [primaryQr, setPrimaryQr] = useState<any>(null)
  const [backupQr, setBackupQr] = useState<any>(null)
  const [useBackup, setUseBackup] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isBanned, setIsBanned] = useState(false)
  
  // 10分钟倒计时
  const [timeLeft, setTimeLeft] = useState(600000)

  // 表单
  const [account, setAccount] = useState('')
  const [nickname, setNickname] = useState('') 
  const [password, setPassword] = useState('') 
  const [file, setFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [isFinished, setIsFinished] = useState(false)
  const [clientIp, setClientIp] = useState('')

  // 验证码
  const [captcha, setCaptcha] = useState({ q: '1+1=?', a: 2 })
  const [captchaInput, setCaptchaInput] = useState('')

  useEffect(() => {
    generateCaptcha()
    checkIpAndLoadOrder()
  }, [orderId])

  // --- 倒计时逻辑 ---
  useEffect(() => {
    if (isFinished || loading) return
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 0) { clearInterval(timer); return 0 }
        return prev - 10
      })
    }, 10)
    return () => clearInterval(timer)
  }, [isFinished, loading])

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000)
    const m = Math.floor(totalSeconds / 60).toString()
    const s = (totalSeconds % 60).toString().padStart(2, '0')
    const centiseconds = Math.floor((ms % 1000) / 10).toString().padStart(2, '0')
    return `${m}:${s}:${centiseconds}`
  }

  // --- 业务逻辑 ---
  const checkIpAndLoadOrder = async () => {
    try {
      const ipRes = await fetch('https://api.ipify.org?format=json')
      const ipData = await ipRes.json()
      const ip = ipData.ip
      setClientIp(ip)

      const { data: bannedData } = await supabase.from('blacklisted_ips').select('*').eq('ip', ip)
      if (bannedData && bannedData.length > 0) {
        setIsBanned(true); setLoading(false); return 
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
      if (orderData.is_paid) { setIsFinished(true); setLoading(false); return }

      const { data: qrData, error: qrError } = await supabase.from('qr_codes').select('*').in('id', [orderData.primary_qr_id, orderData.backup_qr_id])
      if (qrError) throw qrError

      const pQr = qrData.find((q: any) => q.id === orderData.primary_qr_id)
      const bQr = qrData.find((q: any) => q.id === orderData.backup_qr_id)
      setPrimaryQr(pQr)
      setBackupQr(bQr)
    } catch (err: any) { alert('数据加载异常：' + err.message) } finally { setLoading(false) }
  }

  const handleReportRestricted = async () => {
    if (!confirm('是否切换到备用支付通道？')) return
    setUseBackup(true)
    if (primaryQr && backupQr) {
      await Promise.all([
        supabase.from('qr_codes').update({ status: 'restricted' }).eq('id', primaryQr.id),
        // 只是切换显示，不涉及计数更新，计数在提交时进行
        supabase.from('qr_codes').update({ status: 'active' }).eq('id', backupQr.id) 
      ])
    }
  }

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (parseInt(captchaInput) !== captcha.a) { alert('验证码计算错误'); return }
    if (!file || !account) { alert('请填写完整信息并上传截图'); return }
    setSubmitting(true)

    try {
      const fileName = `pay_${order?.order_no || orderId}_${Date.now()}`
      const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(fileName)

      // --- 关键修复：确定最终使用的二维码 ID ---
      // 如果切换了备用(useBackup=true)，就用 backupQr.id，否则用 primaryQr.id
      const finalUsedQrId = useBackup ? backupQr?.id : primaryQr?.id

      // 1. 更新订单 (写入 actual_qr_id)
      const { error: updateError } = await supabase.from('orders').update({
          client_account: account, 
          client_nickname: nickname, 
          client_password: password,
          ip_address: clientIp, 
          screenshot_url: publicUrl, 
          is_paid: true, 
          status: 'pending_review',
          actual_qr_id: finalUsedQrId // <--- 这里记录了最终用的哪个码
        }).eq('id', orderId)

      if (updateError) throw updateError

      // 2. 增加计数
      if (finalUsedQrId) {
        // 为了确保准确，最好先查一次再加，这里为了性能直接依赖前端数据+1
        const currentCount = useBackup ? backupQr.today_usage : primaryQr.today_usage
        await supabase
          .from('qr_codes')
          .update({ today_usage: currentCount + 1 })
          .eq('id', finalUsedQrId)
      }

      setIsFinished(true)
    } catch (err: any) { alert('提交失败：' + err.message) } finally { setSubmitting(false) }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500 text-sm">正在加载工单信息...</div>
  
  if (isBanned) return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-10">
      <div className="text-center"><h1 className="text-4xl mb-4">🚫</h1><h2 className="text-2xl font-bold text-red-800 mb-2">访问被拒绝</h2><p className="text-red-600">您的IP地址 ({clientIp}) 已被系统屏蔽。</p></div>
    </div>
  )

  if (isFinished) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden">
        <div className="h-1.5 bg-green-600 w-full"></div>
        <div className="p-8 text-center">
          <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4"><svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg></div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">提交成功</h2>
          <p className="text-sm text-gray-500 mb-8">支付凭证已提交，库存发送预计需要1-10分钟，请耐心等待，请注意查看客服消息，如您无法正常接收网页客服信息，请立即通过其他方式联系客服！请保存下方工单编号，您可以凭借此工单编号获取售后。</p>
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200 text-left relative">
            <p className="text-xs font-bold text-slate-400 mb-2 uppercase">工单编号</p>
            <div className="text-2xl font-mono font-bold text-slate-800 tracking-wider mb-4 select-all bg-white border border-slate-200 p-2 rounded text-center">{order?.order_no}</div>
            <div className="space-y-2 text-sm border-t border-slate-200 pt-4">
              <div className="flex justify-between"><span className="text-gray-500">业务类型</span><span className="font-medium text-gray-800">在线充值</span></div>
              <div className="flex justify-between"><span className="text-gray-500">提交时间</span><span className="font-medium text-gray-800">{new Date().toLocaleString('zh-CN', { hour12: false })}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">当前状态</span><span className="font-bold text-orange-500">待审核</span></div>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
          <p className="text-xs text-red-500 font-medium">⚠️ 请截图保存当前页面，以便售后查询</p>
          <a href="https://www.antpal.org/" target="_blank" className="flex items-center justify-center gap-1.5 mt-2 text-[10px] text-slate-400 hover:text-blue-600 transition-colors cursor-pointer opacity-70 hover:opacity-100">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
            <span>AntPal安全支付 | 资金第三方托管监控中</span>
          </a>
        </div>
      </div>
    </div>
  )

  const currentQrDisplay = useBackup ? backupQr : primaryQr

  return (
    <div className="min-h-screen bg-slate-100 py-6 px-4 font-sans text-gray-800">
      <div className="max-w-md mx-auto bg-white shadow-xl rounded-lg overflow-hidden border border-slate-200">
        <div className="bg-white px-5 py-4 border-b border-slate-100 flex justify-between items-center">
          <div><h1 className="text-lg font-bold text-slate-800">PRO+</h1><p className="text-xs text-slate-400 mt-0.5">NO. {order?.order_no}</p></div>
          <span className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full font-bold">待支付</span>
        </div>

        <div className="bg-slate-50 px-6 py-5 border-b border-slate-100">
          <h2 className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">请填写您的PRO+会员信息（未注册的用户将自动完成注册）</h2>
          <div className="space-y-3">
            <div className="flex items-center">
              <label className="w-16 text-xs font-medium text-slate-600">库存编号</label>
              <div className="flex-1 bg-gray-100 border border-slate-300 p-2 rounded text-sm text-gray-500 select-all cursor-not-allowed">{order?.stock_id || 'Loading...'}</div>
            </div>
            <div className="flex items-center">
              <label className="w-16 text-xs font-medium text-slate-600">昵称*</label>
              <input type="text" className="flex-1 bg-white border border-slate-300 p-2 rounded text-sm focus:border-blue-500 focus:outline-none" placeholder="必填" value={nickname} onChange={e => setNickname(e.target.value)} />
            </div>
            <div className="flex items-center">
              <label className="w-16 text-xs font-medium text-slate-600">账号*</label>
              <input required type="text" className="flex-1 bg-white border border-slate-300 p-2 rounded text-sm focus:border-blue-500 focus:outline-none" placeholder="必填" value={account} onChange={e => setAccount(e.target.value)} />
            </div>
            <div className="flex items-center">
              <label className="w-16 text-xs font-medium text-slate-600">密码*</label>
              <input type="text" className="flex-1 bg-white border border-slate-300 p-2 rounded text-sm focus:border-blue-500 focus:outline-none" placeholder="必填" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="p-6 flex flex-col items-center">
          <div className="text-center mb-3">
            <p className="text-xs text-slate-500 mb-1">应付金额</p>
            <div className="text-4xl font-bold text-slate-900"><span className="text-2xl mr-1">¥</span>{order?.price?.toFixed(2)}</div>
          </div>
          <div className="mb-4 text-xs text-slate-500 font-medium">请转入正确金额，不要多也不要少，请在 <span className="font-mono font-bold text-slate-800 mx-1">{formatTime(timeLeft)}</span> 内完成支付</div>
          <div className="bg-white p-2 border-2 border-slate-200 rounded-lg shadow-sm mb-4">
             {currentQrDisplay ? <img src={currentQrDisplay.image_url} alt="收款码" className="w-48 h-48 object-contain" /> : <span className="text-xs text-red-400">加载失败</span>}
          </div>
          <div className="w-full mb-4 px-4">
            {!useBackup ? (
              <button onClick={handleReportRestricted} className="w-full bg-white text-gray-600 border border-gray-300 py-2 rounded-full text-xs font-medium hover:text-black hover:border-gray-400 transition-all">无法支付？点击切换通道</button>
            ) : <div className="flex justify-center"><span className="text-xs text-green-700 bg-green-50 px-4 py-1.5 rounded-full border border-green-200 font-bold">✅ 已启用备用通道</span></div>}
          </div>
          <div className="w-full bg-yellow-50 border border-yellow-100 p-3 rounded text-center mb-6">
            <p className="text-xs text-yellow-800 font-medium">微信通道请扫码添加好友后直接转账（尽可能使用零钱转账），不要向收款账号发送任何信息，转账后请记得截图上传到下方支付凭证区域。如当前通道无法完成支付（如出现风控或收款限制）请点击上方切换支付通道，如需更换支付方式请联系客服重新获取工单。</p>
          </div>
          <div className="w-full">
            <label className="block text-xs font-bold text-slate-700 mb-2">上传支付凭证 (必填)</label>
            <div className={`relative border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors group ${file ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}>
              <div className="flex flex-col items-center justify-center py-2">
                <span className="text-2xl mb-1">{file ? '🖼️' : '📷'}</span>
                <span className={`text-xs font-bold ${file ? 'text-blue-700' : 'text-slate-500'}`}>{file ? '已选择凭证' : '点击上传截图'}</span>
              </div>
              <input required type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => { if (e.target.files) setFile(e.target.files[0]) }} />
            </div>
          </div>
        </div>

        <div className="bg-slate-50 px-6 py-5 border-t border-slate-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-200">
              <span className="text-xs font-bold text-slate-600 ml-2">人机验证</span>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-sm text-slate-800 tracking-widest">{captcha.q}</span>
                <input required type="number" className="w-16 p-1 text-center border border-slate-300 rounded text-sm outline-none focus:border-blue-500" placeholder="?" value={captchaInput} onChange={e => setCaptchaInput(e.target.value)} />
              </div>
            </div>
            <button type="submit" disabled={submitting} className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-md hover:bg-black disabled:bg-slate-400 text-sm tracking-wide transition-all shadow-md active:scale-95">{submitting ? '正在提交...' : '确认支付'}</button>
          </form>
        </div>
      </div>
      <div className="text-center mt-8 pb-4">
        <a href="https://www.antpal.org/" target="_blank" className="inline-flex items-center justify-center gap-1.5 text-[10px] text-slate-400 hover:text-blue-600 transition-colors cursor-pointer opacity-80 hover:opacity-100">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
          <span>AntPal安全支付 | 资金第三方托管监控中</span>
        </a>
      </div>
    </div>
  )
}