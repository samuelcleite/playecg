export default async function googleAuthUrl(req) {
  const { deeplink_scheme } = await req.json();
  const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || req.headers.get('origin');
  const redirectUri = `${APP_BASE_URL}/native-callback.html`;

  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: deeplink_scheme,
    });

  return Response.json({ url });
}