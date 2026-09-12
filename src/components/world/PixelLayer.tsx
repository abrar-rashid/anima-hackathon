import type { Pixel } from './sprites'
import styles from './atlas.module.css'

export function PixelLayer({ pixels, prefix }: { pixels: Pixel[]; prefix: string }) {
  return (
    <>
      {pixels.map((pixel, index) => (
        <rect
          key={`${prefix}-${String(index)}`}
          className={styles.pixel}
          x={pixel.x}
          y={pixel.y}
          width={pixel.w}
          height={pixel.h}
          fill={pixel.fill}
        />
      ))}
    </>
  )
}
