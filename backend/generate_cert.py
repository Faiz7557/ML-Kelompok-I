"""
generate_cert.py – One-time script to create a self-signed SSL certificate.
Run this once before starting the server with HTTPS:
    python generate_cert.py
Outputs: cert.pem and key.pem in the backend/ directory.
"""
import datetime
from datetime import timezone
from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
import ipaddress
import socket

def generate_self_signed_cert():
    # Generate RSA private key
    key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
    )

    # Get local IP addresses to include in the certificate SAN
    local_ips = ["127.0.0.1"]
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
        if local_ip not in local_ips:
            local_ips.append(local_ip)
    except Exception:
        pass

    print(f"Generating certificate for IPs: {local_ips}")

    # Build certificate
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "ID"),
        x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "Indonesia"),
        x509.NameAttribute(NameOID.LOCALITY_NAME, "Jakarta"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "SafeSchool AI"),
        x509.NameAttribute(NameOID.COMMON_NAME, "safeschool.local"),
    ])

    san_list = [x509.DNSName("localhost"), x509.DNSName("safeschool.local")]
    for ip_str in local_ips:
        san_list.append(x509.IPAddress(ipaddress.IPv4Address(ip_str)))

    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.datetime.now(timezone.utc))
        .not_valid_after(datetime.datetime.now(timezone.utc) + datetime.timedelta(days=3650))
        .add_extension(x509.SubjectAlternativeName(san_list), critical=False)
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )

    # Write key.pem
    with open("key.pem", "wb") as f:
        f.write(key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        ))

    # Write cert.pem
    with open("cert.pem", "wb") as f:
        f.write(cert.public_bytes(serialization.Encoding.PEM))

    print("\n[OK] Certificate generated successfully!")
    print("   cert.pem -- SSL certificate")
    print("   key.pem  -- Private key")
    print("\nSAN (Subject Alternative Names) included:")
    for name in san_list:
        print(f"   - {name.value}")
    print("\nNow start the server with:")
    print("   uvicorn main:app --host 0.0.0.0 --port 8443 --ssl-keyfile=key.pem --ssl-certfile=cert.pem")
    print("\nAccess via: https://<your-ip>:8443")

if __name__ == "__main__":
    generate_self_signed_cert()
