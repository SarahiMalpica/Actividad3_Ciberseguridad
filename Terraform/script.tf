terraform {
  required_version = ">= 1.17.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }
}

provider "aws" {
  region     = "us-east-1"
  access_key = "test"
  secret_key = "test"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true

  endpoints {
    s3  = "http://127.0.0.1:4566"
    s3control = "http://localhost.localstack.cloud:4566"
    iam = "http://127.0.0.1:4566"
    sts = "http://127.0.0.1:4566"
  }
}

resource "aws_s3_bucket" "secure_bucket" {
  bucket = "actividad3-seguro-2024"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "secure_bucket" {
  bucket = aws_s3_bucket.secure_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "secure_bucket" {
  bucket = aws_s3_bucket.secure_bucket.id

  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

output "bucket_name" {
  value = aws_s3_bucket.secure_bucket.id
}

output "localstack_endpoint" {
  value = "http://127.0.0.1:4566"
}