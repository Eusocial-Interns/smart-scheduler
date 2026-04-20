from flask import Flask, jsonify, request, render_template
from flask_cors import CORS

app = Flask(
    __name__,
    template_folder='../templates/scheduling',
    static_folder='../static/scheduling'
)

CORS(app)

schedule_data = {
    "week": "2026-04-13",
    "publishState": "draft",
    "schedule": [
        {
            "day": "Monday",
            "roles": [
                {
                    "role": "Cashier",
                    "required": 2,
                    "assigned": ["Alice"]
                },
                {
                    "role": "Cook",
                    "required": 1,
                    "assigned": ["Bob"]
                }
            ]
        },
        {
            "day": "Tuesday",
            "roles": [
                {
                    "role": "Cashier",
                    "required": 2,
                    "assigned": []
                }
            ]
        }
    ]
}

def calculate_coverage(schedule):
    for day in schedule:
        for role in day["roles"]:
            assigned_count = len(role["assigned"])
            required = role["required"]

            if assigned_count == 0:
                role["status"] = "empty"
            elif assigned_count < required:
                role["status"] = "understaffed"
            else:
                role["status"] = "covered"

    return schedule



@app.route('weekly_schedule_test/')
def home():
    return render_template('publish_workflow.html')



@app.route('/api/schedule', methods=['GET'])
def get_schedule():
    updated_schedule = calculate_coverage(schedule_data["schedule"])

    return jsonify({
        "week": schedule_data["week"],
        "publishState": schedule_data["publishState"],
        "schedule": updated_schedule
    })

@app.route('/api/schedule/update', methods=['POST'])
def update_schedule():
    global schedule_data

    if schedule_data["publishState"] == "published":
        return jsonify({"error": "Schedule is published"}), 403

    data = request.json
    schedule_data["schedule"] = data.get("schedule", [])

    return jsonify({"message": "Schedule updated"})


@app.route('/api/schedule/publish', methods=['POST'])
def update_publish_state():
    global schedule_data

    data = request.json
    new_state = data.get("publishState", "draft")

    if new_state == "published":
        for day in schedule_data["schedule"]:
            for role in day["roles"]:
                if len(role["assigned"]) < role["required"]:
                    return jsonify({
                        "error": f"{day['day']} - {role['role']} is understaffed"
                    }), 400

    schedule_data["publishState"] = new_state

    return jsonify({
        "message": "Updated",
        "publishState": new_state
    })

if __name__ == '__main__':
    app.run(debug=True)