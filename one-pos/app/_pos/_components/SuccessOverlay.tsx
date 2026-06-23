'use client'

import { Button } from '@/components/ui/button'

export function SuccessOverlay({ lastNota, onClose }: { lastNota: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-30 p-6">
      <div className="bg-white border border-gray-200 rounded-3xl p-10 text-center space-y-4 w-full max-w-xs shadow-xl">
        <p className="text-5xl">✅</p>
        <p className="text-gray-900 text-2xl font-bold">Berhasil!</p>
        <p className="text-gray-500 font-mono text-base">{lastNota}</p>
        <Button
          onClick={onClose}
          className="w-full h-12 text-base font-bold rounded-2xl bg-orange-600 hover:bg-orange-500 border-0 text-white"
        >
          Transaksi Baru
        </Button>
      </div>
    </div>
  )
}
