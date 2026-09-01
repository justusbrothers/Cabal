# /plugins/Cabal/cabal/apps/nexus/attach_image.py


import requests
from django.core.files.base import ContentFile
from django.http import JsonResponse
from part.models import Part
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

# logger = logging.getLogger("inventree")


class AttachPartImage(APIView):
    """Server-side endpoint to fetch external image bytes via requests and save to Part model directly."""

    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        part_id = request.data.get("part_id")
        image_url = request.data.get("image_url")

        # logger.debug(f"[Nexus:AttachPartImageView] part_id: '{part_id}'")
        # logger.debug(f"[Nexus:AttachPartImageView] image_url: '{image_url}'")

        if not part_id or not image_url:
            return JsonResponse(
                {"success": False, "error": "Missing part_id or image_url"}, status=400
            )

        try:
            # 1. Fetch image server-side to bypass CORS
            img_res = requests.get(image_url, timeout=10)
            if img_res.status_code != 200:
                return JsonResponse(
                    {
                        "success": False,
                        "error": f"Failed to fetch image: HTTP {img_res.status_code}",
                    },
                    status=400,
                )

            # 2. Extract or generate filename
            filename = image_url.split("/")[-1].split("?")[0] or f"part_{part_id}.jpg"

            # 3. Retrieve Part using InvenTree ORM model
            part = Part.objects.get(pk=part_id)

            # 4. Save file directly to image field using ContentFile
            part.image.save(filename, ContentFile(img_res.content), save=True)

        except Part.DoesNotExist:
            return JsonResponse(
                {"success": False, "error": f"Part PK #{part_id} not found"}, status=404
            )
        except Exception as e:
            return JsonResponse({"success": False, "error": str(e)}, status=500)

        return JsonResponse({
            "success": True,
            "message": f"Successfully attached {filename} to part {part_id}",
        })
