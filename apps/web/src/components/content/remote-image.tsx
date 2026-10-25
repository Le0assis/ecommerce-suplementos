import Image from "next/image";

/**
 * Foto vinda de URL do CMS. `unoptimized` evita o otimizador do Next,
 * que exigiria `images.remotePatterns` em next.config.ts para cada host.
 */
export function RemoteImage({
  src,
  alt,
  className,
  fill = false,
  width,
  height,
  sizes,
}: {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
}) {
  if (fill) {
    return <Image src={src} alt={alt} fill unoptimized className={className} sizes={sizes ?? "100vw"} />;
  }
  return (
    <Image
      src={src}
      alt={alt}
      width={width ?? 1600}
      height={height ?? 1000}
      unoptimized
      className={className}
      sizes={sizes ?? "(min-width: 768px) 768px, 100vw"}
    />
  );
}
