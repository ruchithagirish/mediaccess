/** @type {import('next').NextConfig} */
const nextConfig = {
	reactStrictMode: true,
	async redirects() {
		return [
			{ source: "/our-doctors", destination: "/doctors", permanent: true },
			{ source: "/specialities", destination: "/specialties", permanent: true },
		];
	},
};
export default nextConfig;
